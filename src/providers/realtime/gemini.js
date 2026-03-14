/**
 * Google Gemini Live (BidiGenerateContent) provider.
 *
 * Mirrors the interface of openai.js but connects to Google's
 * bidirectional streaming API for real-time voice conversations.
 *
 * Called when ai_config.realtime_model starts with 'gemini-'.
 * The /media-stream route is shared; the provider is chosen at
 * session start based on the model field.
 *
 * Gemini Live API:
 *   wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=KEY
 *
 * Audio:
 *   Input  — Twilio sends g711_ulaw; Gemini accepts LINEAR16 or MULAW 8kHz
 *   Output — Gemini returns LINEAR16 24kHz; must encode to g711_ulaw for Twilio
 *
 * Encoding: We pass mulaw directly to Gemini (supported as "MULAW" at 8000 Hz)
 * and request mulaw output so we can relay bytes with zero transcoding.
 */

import WebSocket from 'ws';
import { getSession, updateSession, deleteSession } from '../../sessions/store.js';
import { generateSystemPrompt } from '../../workflows/prompts.js';
import { buildTools }           from '../../workflows/tools.js';
import { dispatch }             from '../../workflows/handler.js';
import { closeCallRecord }      from '../../services/calls.js';

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// Gemini tool schema uses OpenAPI-style JSON Schema (same as OpenAI function tools)
function toGeminiTools(openAiTools) {
  return openAiTools.map((t) => ({
    name:        t.name,
    description: t.description,
    parameters:  t.parameters,
  }));
}

/**
 * Handle a Gemini Live session for a single Twilio call.
 * Called by the shared /media-stream WebSocket handler when the session
 * ai_config.realtime_model begins with 'gemini-'.
 */
export function handleGeminiSession(twilioWs, session) {
  const { callSid } = session;
  let geminiWs      = null;
  let streamSid     = null;
  let callStartTime = Date.now();
  let pendingFnId   = null;   // current function call id waiting for output

  function teardown(status = 'completed') {
    if (callSid) {
      const duration = Math.round((Date.now() - callStartTime) / 1000);
      closeCallRecord(session.callId, { status, durationSeconds: duration })
        .catch((err) => console.error('[Gemini] closeCallRecord error:', err.message));
      deleteSession(callSid);
    }
    if (geminiWs?.readyState === WebSocket.OPEN) geminiWs.close();
  }

  function endCall() {
    twilioWs.close();
    teardown('completed');
  }

  // ── Open Gemini WS ──────────────────────────────────────────────────────────
  const model   = session.aiConfig?.realtime_model || 'gemini-2.0-flash-live-001';
  const wsUrl   = `${GEMINI_WS_BASE}?key=${GEMINI_API_KEY}`;

  geminiWs = new WebSocket(wsUrl, {
    headers: { 'Content-Type': 'application/json' },
  });

  geminiWs.on('open', () => {
    console.log(`[Gemini] Connected for call ${callSid}`);

    const systemPrompt = generateSystemPrompt(session);
    const tools        = buildTools(session.workflows?.[0]?.type || 'ordering');

    // BidiGenerateContentSetup
    geminiWs.send(JSON.stringify({
      setup: {
        model: `models/${model}`,
        generation_config: {
          response_modalities:    ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: session.aiConfig?.realtime_voice || 'Aoede',
              },
            },
          },
        },
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        tools: tools.length ? [{ function_declarations: toGeminiTools(tools) }] : [],
        realtime_input_config: {
          media_chunks_config: {
            sample_rate_hertz: 8000,
            encoding: 'MULAW',
          },
        },
      },
    }));
  });

  geminiWs.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Server-ready ack
    if (msg.setupComplete) {
      console.log(`[Gemini] Session ready for ${callSid}`);
      return;
    }

    const parts = msg.serverContent?.modelTurn?.parts || [];

    for (const part of parts) {
      // Audio output → relay to Twilio
      if (part.inlineData?.mimeType?.startsWith('audio/') && streamSid) {
        const audioBase64 = part.inlineData.data;
        twilioWs.send(JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload: audioBase64 },
        }));
      }

      // Function call
      if (part.functionCall) {
        const { id, name, args } = part.functionCall;
        pendingFnId = id;
        console.log(`[Gemini] Tool call: ${name}`, args);

        const result = await dispatch(callSid, name, args || {}, { endCallFn: endCall });

        geminiWs.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              id,
              name,
              response: { output: result },
            }],
          },
        }));
      }
    }

    // Turn complete signal
    if (msg.serverContent?.turnComplete) {
      // Mark in session that turn is done
    }
  });

  geminiWs.on('error', (err) => {
    console.error(`[Gemini] WS error for ${callSid}:`, err.message);
  });

  geminiWs.on('close', () => {
    console.log(`[Gemini] Disconnected for ${callSid}`);
    teardown();
  });

  // ── Handle Twilio messages ───────────────────────────────────────────────────
  twilioWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.event === 'start') {
      streamSid = msg.start?.streamSid;
    }

    if (msg.event === 'media' && geminiWs?.readyState === WebSocket.OPEN) {
      // Relay mulaw audio directly to Gemini
      geminiWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/mulaw;rate=8000',
            data:     msg.media.payload,
          }],
        },
      }));
    }

    if (msg.event === 'stop') {
      teardown('completed');
    }
  });

  twilioWs.on('close', () => {
    console.log(`[Gemini] Twilio WS closed for ${callSid}`);
    teardown('completed');
  });
}
