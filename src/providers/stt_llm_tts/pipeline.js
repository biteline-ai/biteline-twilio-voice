/**
 * STT → LLM → TTS pipeline provider.
 *
 * Handles the /media-stream WebSocket for calls routed to the
 * 'stt_llm_tts' pipeline.  Unlike the Realtime providers (which use
 * a single bidirectional WebSocket), this pipeline:
 *
 *   1. Streams Twilio audio to a STT engine (Deepgram streaming or Whisper)
 *   2. On transcript: runs the LLM (any provider) with the full conversation
 *   3. Synthesizes the response with a TTS engine
 *   4. Streams the resulting mulaw audio back to Twilio
 *
 * STT: deepgram (streaming, low-latency) | groq | openai (batch Whisper)
 * LLM: openai | anthropic | groq | google | xai
 * TTS: openai | elevenlabs | cartesia | deepgram
 *
 * Provider selection is driven by session.aiConfig:
 *   stt_provider, llm_provider, tts_provider
 *   stt_model, llm_model, tts_voice
 */

import { getSession, deleteSession } from '../../sessions/store.js';
import { generateSystemPrompt }      from '../../workflows/prompts.js';
import { buildTools }                from '../../workflows/tools.js';
import { dispatch }                  from '../../workflows/handler.js';
import { closeCallRecord }           from '../../services/calls.js';
import { releaseCallSlot }           from '../../services/callLimiter.js';
import { createSTT }                 from './stt.js';
import { complete as llmComplete }   from './llm.js';
import { synthesize as ttsSynth }    from './tts.js';

const MAX_AUDIO_BUFFER_MS  = 30_000; // 30s max before forced flush
const SILENCE_TIMEOUT_MS   = 800;    // wait 800ms after last audio before sending to Whisper

/**
 * Handle a single Twilio call over the STT→LLM→TTS pipeline.
 * Called from the /media-stream WebSocket handler for non-realtime calls.
 */
export function handleSTTPipeline(twilioWs, session) {
  const { callSid, aiConfig } = session;

  const sttProvider = aiConfig?.stt_provider || 'deepgram';
  const llmProvider = aiConfig?.llm_provider || 'openai';
  const ttsProvider = aiConfig?.tts_provider || 'openai';
  const llmModel    = aiConfig?.llm_model    || undefined;
  const ttsVoice    = aiConfig?.tts_voice    || undefined;

  let streamSid     = null;
  let callStartTime = Date.now();

  // ── Conversation history (for multi-turn LLM context) ─────────────────────
  const messages = [];

  // ── STT setup ───────────────────────────────────────────────────────────────
  let silenceTimer = null;
  const systemPrompt = generateSystemPrompt(session);
  const tools        = buildTools(session.workflows?.[0]?.type || 'ordering', session.aiConfig);

  async function handleTranscript(text) {
    if (!text?.trim()) return;
    console.log(`[STT→LLM→TTS] Transcript: "${text}"`);

    messages.push({ role: 'user', content: text });

    // ── LLM completion ───────────────────────────────────────────────────────
    let assistantText = '';
    const textChunks  = [];

    try {
      await llmComplete({
        provider:     llmProvider,
        model:        llmModel,
        systemPrompt,
        messages:     [...messages],
        tools,
        onText: (chunk) => {
          textChunks.push(chunk);
          assistantText += chunk;
        },
        onToolCall: async ({ name, args }) => {
          console.log(`[STT→LLM→TTS] Tool: ${name}`);
          const result = await dispatch(callSid, name, args || {}, {
            endCallFn: () => twilioWs.close(),
          });
          // Inject tool result into message history
          messages.push({
            role:    'assistant',
            content: null,
            tool_calls: [{ type: 'function', function: { name, arguments: JSON.stringify(args) } }],
          });
          messages.push({ role: 'tool', content: result });
        },
      });
    } catch (err) {
      console.error('[STT→LLM→TTS] LLM error:', err.message);
      assistantText = 'I\'m sorry, I had trouble processing that. Could you repeat?';
    }

    if (!assistantText) return;
    messages.push({ role: 'assistant', content: assistantText });

    // ── TTS synthesis ────────────────────────────────────────────────────────
    try {
      const audioBuffer = await ttsSynth({
        provider: ttsProvider,
        voice:    ttsVoice,
        text:     assistantText,
      });

      if (!streamSid) return;

      // Send audio to Twilio in ~20ms chunks (160 bytes @ 8kHz mulaw)
      const CHUNK_SIZE = 160;
      for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
        const chunk = audioBuffer.slice(offset, offset + CHUNK_SIZE);
        twilioWs.send(JSON.stringify({
          event:     'media',
          streamSid,
          media:     { payload: chunk.toString('base64') },
        }));
      }
    } catch (err) {
      console.error('[STT→LLM→TTS] TTS error:', err.message);
    }
  }

  // ── STT instance ─────────────────────────────────────────────────────────────
  const stt = createSTT(sttProvider, {
    apiKey:      process.env[`${sttProvider.toUpperCase()}_API_KEY`],
    onTranscript: handleTranscript,
    onError:     (err) => console.error('[STT] Error:', err.message),
  });

  // For batch STT (groq/openai), we use silence detection to trigger transcription
  const isBatchSTT = sttProvider !== 'deepgram';

  function scheduleSilenceFlush() {
    if (!isBatchSTT) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(async () => {
      const text = await stt.transcribe?.();
      if (text) handleTranscript(text);
    }, SILENCE_TIMEOUT_MS);
  }

  // ── Twilio WS handlers ────────────────────────────────────────────────────────
  twilioWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.event === 'start') {
      streamSid = msg.start?.streamSid;
      console.log(`[STT→LLM→TTS] Stream started — sid=${streamSid}`);
    }

    if (msg.event === 'media') {
      stt.send(msg.media.payload);
      scheduleSilenceFlush();
    }

    if (msg.event === 'stop') {
      teardown('completed');
    }
  });

  twilioWs.on('close', () => teardown('completed'));
  twilioWs.on('error', (err) => {
    console.error(`[STT→LLM→TTS] Twilio WS error:`, err.message);
    teardown('failed');
  });

  let tornDown = false;
  function teardown(status = 'completed') {
    if (tornDown) return;
    tornDown = true;

    if (silenceTimer) clearTimeout(silenceTimer);
    stt.close?.();
    const duration = Math.round((Date.now() - callStartTime) / 1000);
    const sess = getSession(callSid);
    if (sess?.callId) {
      closeCallRecord(sess.callId, { status, durationSeconds: duration })
        .catch((err) => console.error('[STT→LLM→TTS] closeCallRecord:', err.message));
    }

    releaseCallSlot(sess?.businessId)
      .catch((err) => console.error('[STT→LLM→TTS] releaseCallSlot error:', err.message));

    deleteSession(callSid);
  }
}
