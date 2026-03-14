/**
 * OpenAI Realtime API provider.
 *
 * Registers the /media-stream WebSocket route.  When Twilio connects,
 * this provider:
 *   1. Waits for the Twilio 'start' event to get CallSid
 *   2. Looks up the session from the store (set by the /incoming-call handler)
 *   3. Opens a WebSocket to the OpenAI Realtime API
 *   4. Configures the session (system prompt, tools, voice, etc.)
 *   5. Relays audio bidirectionally (Twilio g711_ulaw ↔ OpenAI g711_ulaw)
 *   6. Handles function calls via the tool dispatcher
 *   7. Closes and records the call on disconnect
 */

import WebSocket from 'ws';
import { getSession, updateSession, deleteSession } from '../../sessions/store.js';
import { generateSystemPrompt } from '../../workflows/prompts.js';
import { buildTools }           from '../../workflows/tools.js';
import { dispatch }             from '../../workflows/handler.js';
import { closeCallRecord }      from '../../services/calls.js';

const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';

/**
 * Register the /media-stream WebSocket route on the Fastify instance.
 */
export function setupRealtimeProvider(fastify) {
  fastify.get('/media-stream', { websocket: true }, (twilioWs, request) => {
    console.log('[OpenAI] Twilio media stream connected');

    let openAiWs      = null;   // WebSocket to OpenAI
    let callSid       = null;   // Set on Twilio 'start' event
    let streamSid     = null;   // Twilio stream ID for sending audio back
    let callStartTime = null;   // For computing duration
    let isConnected   = false;  // OpenAI WS open flag

    // ── Tear-down helper ────────────────────────────────────────────────────
    function teardown(status = 'completed') {
      if (callSid) {
        const session = getSession(callSid);
        const duration = callStartTime
          ? Math.round((Date.now() - callStartTime) / 1000)
          : 0;

        if (session?.callId) {
          closeCallRecord(session.callId, {
            status,
            durationSeconds: duration,
            engagementId: session.engagement?.id || null,
          }).catch((err) => console.error('[OpenAI] Error closing call record:', err.message));
        }
        deleteSession(callSid);
      }

      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        openAiWs.close();
      }
    }

    // ── Twilio → handler ────────────────────────────────────────────────────
    twilioWs.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.event) {

        case 'start': {
          callSid       = msg.start.callSid;
          streamSid     = msg.start.streamSid;
          callStartTime = Date.now();
          console.log(`[OpenAI] Call started: ${callSid}`);

          const session = getSession(callSid);
          if (!session) {
            console.error(`[OpenAI] No session for callSid: ${callSid}`);
            twilioWs.close();
            return;
          }

          // Determine model + voice from ai_config (with sensible defaults)
          const aiConfig = session.aiConfig || {};
          const model    = aiConfig.realtime_model || 'gpt-4o-mini-realtime-preview';
          const voice    = aiConfig.realtime_voice || 'alloy';

          // Open OpenAI Realtime WebSocket
          openAiWs = new WebSocket(
            `${OPENAI_REALTIME_URL}?model=${model}`,
            {
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta':  'realtime=v1',
              },
            }
          );

          openAiWs.on('open', () => {
            isConnected = true;
            console.log(`[OpenAI] Connected to Realtime API (${model})`);

            // Determine workflow type for tool selection
            const workflow     = session.workflows?.find((w) => w.is_active) || session.workflows?.[0];
            const workflowType = workflow?.type || 'ordering';

            const sessionConfig = {
              type:  'session.update',
              session: {
                turn_detection:     { type: 'server_vad' },
                input_audio_format:  'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                voice,
                instructions:   generateSystemPrompt(session),
                modalities:     ['text', 'audio'],
                temperature:    aiConfig.temperature ?? 0.8,
                tools:          buildTools(workflowType),
                tool_choice:    'auto',
              },
            };

            if (aiConfig.max_tokens) {
              sessionConfig.session.max_response_output_tokens = aiConfig.max_tokens;
            }

            openAiWs.send(JSON.stringify(sessionConfig));
          });

          openAiWs.on('message', async (oaiRaw) => {
            let oaiMsg;
            try {
              oaiMsg = JSON.parse(oaiRaw);
            } catch {
              return;
            }

            switch (oaiMsg.type) {

              // Relay audio back to Twilio
              case 'response.audio.delta': {
                if (oaiMsg.delta && streamSid) {
                  const payload = {
                    event:     'media',
                    streamSid,
                    media:     { payload: oaiMsg.delta },
                  };
                  if (twilioWs.readyState === WebSocket.OPEN) {
                    twilioWs.send(JSON.stringify(payload));
                  }
                }
                break;
              }

              // Mark audio response complete — signal Twilio to flush buffer
              case 'response.audio.done': {
                if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
                  twilioWs.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: 'response_done' } }));
                }
                break;
              }

              // Handle function calls
              case 'response.function_call_arguments.done': {
                const { name, arguments: rawArgs, call_id } = oaiMsg;
                let args = {};
                try { args = JSON.parse(rawArgs || '{}'); } catch { /* ignore */ }

                console.log(`[OpenAI] Tool call: ${name}`, args);

                const result = await dispatch(callSid, name, args, {
                  endCallFn: () => {
                    twilioWs.close();
                    openAiWs.close();
                  },
                });

                // Send function result back to OpenAI
                if (openAiWs.readyState === WebSocket.OPEN) {
                  openAiWs.send(JSON.stringify({
                    type:    'conversation.item.create',
                    item: {
                      type:    'function_call_output',
                      call_id,
                      output:  result,
                    },
                  }));
                  // Trigger the model to continue responding
                  openAiWs.send(JSON.stringify({ type: 'response.create' }));
                }
                break;
              }

              // Session created — log it
              case 'session.created':
                console.log(`[OpenAI] Session created: ${oaiMsg.session?.id}`);
                break;

              // Input transcription (for logging)
              case 'conversation.item.input_audio_transcription.completed':
                console.log(`[OpenAI] Caller said: "${oaiMsg.transcript}"`);
                break;

              // Error from OpenAI
              case 'error':
                console.error('[OpenAI] API error:', oaiMsg.error);
                break;

              default:
                break;
            }
          });

          openAiWs.on('close', (code, reason) => {
            isConnected = false;
            console.log(`[OpenAI] WebSocket closed (${code}): ${reason}`);
          });

          openAiWs.on('error', (err) => {
            console.error('[OpenAI] WebSocket error:', err.message);
          });

          break;
        }

        // Relay audio from Twilio to OpenAI
        case 'media': {
          if (openAiWs?.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({
              type:  'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          }
          break;
        }

        // Caller hung up
        case 'stop': {
          console.log(`[OpenAI] Twilio stream stopped: ${callSid}`);
          teardown('completed');
          break;
        }

        default:
          break;
      }
    });

    twilioWs.on('close', () => {
      console.log(`[OpenAI] Twilio WebSocket closed`);
      teardown('completed');
    });

    twilioWs.on('error', (err) => {
      console.error('[OpenAI] Twilio WS error:', err.message);
      teardown('failed');
    });
  });
}
