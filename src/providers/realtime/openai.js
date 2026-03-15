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
import { deleteSession } from '../../sessions/store.js';
import { generateSystemPrompt } from '../../workflows/prompts.js';
import { buildTools }           from '../../workflows/tools.js';
import { dispatch }             from '../../workflows/handler.js';
import { closeCallRecord, saveTranscript } from '../../services/calls.js';
import { releaseCallSlot }                 from '../../services/callLimiter.js';

const OPENAI_API_KEY      = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';

if (!OPENAI_API_KEY) {
  console.warn('[OpenAI] OPENAI_API_KEY is not set — OpenAI Realtime provider will fail to authenticate');
}

/**
 * Handle an OpenAI Realtime session for a single Twilio call.
 * Called by the shared /media-stream router after session lookup.
 *
 * @param {import('ws').WebSocket} twilioWs
 * @param {object} session  - pre-loaded session from the store
 */
export function handleOpenAISession(twilioWs, session) {
  const { callSid, aiConfig = {} } = session;

  let openAiWs      = null;
  let streamSid     = null;
  let callStartTime = null;
  let isConnected   = false;

  // Transcript accumulation — [{role, content}]
  const transcript = [];

  // ── Tear-down helper ──────────────────────────────────────────────────────
  let tornDown = false;
  function teardown(status = 'completed') {
    if (tornDown) return;
    tornDown = true;

    const duration = callStartTime
      ? Math.round((Date.now() - callStartTime) / 1000)
      : 0;

    if (session?.callId) {
      closeCallRecord(session.callId, {
        status,
        durationSeconds: duration,
        engagementId: session.engagement?.id || null,
      }).catch((err) => console.error('[OpenAI] Error closing call record:', err.message));
      saveTranscript(session.callId, session.businessId, transcript)
        .catch((err) => console.error('[OpenAI] saveTranscript error:', err.message));
    }

    releaseCallSlot(session?.businessId)
      .catch((err) => console.error('[OpenAI] releaseCallSlot error:', err.message));

    deleteSession(callSid);

    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
  }

  // ── Twilio → handler ──────────────────────────────────────────────────────
  twilioWs.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.event) {

      case 'start': {
        streamSid     = msg.start?.streamSid;
        callStartTime = Date.now();
        console.log(`[OpenAI] Call started: ${callSid}`);

        const model = aiConfig.realtime_model || 'gpt-4o-mini-realtime-preview';
        const voice = aiConfig.realtime_voice || 'alloy';

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

          const workflowType = session.activeWorkflow?.type || 'ordering';

          const sessionConfig = {
            type:  'session.update',
            session: {
              turn_detection:             { type: 'server_vad' },
              input_audio_format:          'g711_ulaw',
              output_audio_format:         'g711_ulaw',
              input_audio_transcription:  { model: 'whisper-1' },
              voice,
              instructions:   generateSystemPrompt(session),
              modalities:     ['text', 'audio'],
              temperature:    aiConfig.temperature ?? 0.8,
              tools:          buildTools(workflowType, aiConfig),
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

            case 'response.audio.done': {
              if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
                twilioWs.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: 'response_done' } }));
              }
              break;
            }

            case 'response.function_call_arguments.done': {
              const { name, arguments: rawArgs, call_id } = oaiMsg;
              let args = {};
              try { args = JSON.parse(rawArgs || '{}'); } catch (err) {
                console.error(`[OpenAI] Failed to parse tool arguments for ${name}:`, err.message, rawArgs);
                break;
              }

              console.log(`[OpenAI] Tool call: ${name}`, args);

              let result;
              try {
                result = await dispatch(callSid, name, args, {
                  endCallFn: () => {
                    twilioWs.close();
                    openAiWs.close();
                  },
                });
              } catch (err) {
                console.error(`[OpenAI] dispatch error for ${name}:`, err.message);
                result = `Error executing ${name}: ${err.message}`;
              }

              if (openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({
                  type:    'conversation.item.create',
                  item: {
                    type:    'function_call_output',
                    call_id,
                    output:  result,
                  },
                }));
                openAiWs.send(JSON.stringify({ type: 'response.create' }));
              }
              break;
            }

            case 'session.created':
              console.log(`[OpenAI] Session created: ${oaiMsg.session?.id}`);
              break;

            case 'response.audio_transcript.done': {
              const text = oaiMsg.transcript?.trim();
              if (text) {
                transcript.push({ role: 'assistant', content: text });
              }
              break;
            }

            case 'conversation.item.input_audio_transcription.completed': {
              const text = oaiMsg.transcript?.trim();
              console.log(`[OpenAI] Caller said: "${text}"`);
              if (text) {
                transcript.push({ role: 'user', content: text });
              }
              break;
            }

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

      case 'media': {
        if (!msg.media?.payload) break;
        if (openAiWs?.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({
            type:  'input_audio_buffer.append',
            audio: msg.media.payload,
          }));
        }
        break;
      }

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
    console.log('[OpenAI] Twilio WebSocket closed');
    teardown('completed');
  });

  twilioWs.on('error', (err) => {
    console.error('[OpenAI] Twilio WS error:', err.message);
    teardown('failed');
  });
}
