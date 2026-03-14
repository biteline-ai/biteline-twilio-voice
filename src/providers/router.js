/**
 * /media-stream WebSocket router.
 *
 * Registers the single /media-stream route used by Twilio Media Streams.
 * On each new connection, waits for the Twilio 'start' event, looks up
 * the pre-built session, and dispatches to the correct AI provider:
 *
 *   pipeline === 'stt_llm_tts'              → STT→LLM→TTS pipeline
 *   realtime_model starts with 'gemini-'    → Google Gemini Live
 *   otherwise                               → OpenAI Realtime
 */

import { getSession }            from '../sessions/store.js';
import { handleOpenAISession }   from './realtime/openai.js';
import { handleGeminiSession }   from './realtime/gemini.js';
import { handleSTTPipeline }     from './stt_llm_tts/pipeline.js';

export function setupMediaStreamRoute(fastify) {
  fastify.get('/media-stream', { websocket: true }, (twilioWs) => {
    console.log('[Router] Twilio media stream connected — waiting for start event');

    // Read the first message to determine routing
    twilioWs.once('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.event !== 'start') {
        console.warn('[Router] First message was not "start":', msg.event);
        return;
      }

      const callSid = msg.start?.callSid || msg.start?.customParameters?.callSid;
      if (!callSid) {
        console.error('[Router] No callSid in start event');
        twilioWs.close();
        return;
      }

      const session = getSession(callSid);
      if (!session) {
        console.error(`[Router] No session found for callSid: ${callSid}`);
        twilioWs.close();
        return;
      }

      const { pipeline, aiConfig = {} } = session;

      if (pipeline === 'stt_llm_tts') {
        console.log(`[Router] → STT→LLM→TTS pipeline (${callSid})`);
        handleSTTPipeline(twilioWs, session);
      } else if (aiConfig.realtime_model?.startsWith('gemini-')) {
        console.log(`[Router] → Gemini Live (${aiConfig.realtime_model}) (${callSid})`);
        handleGeminiSession(twilioWs, session);
      } else {
        console.log(`[Router] → OpenAI Realtime (${aiConfig.realtime_model || 'default'}) (${callSid})`);
        handleOpenAISession(twilioWs, session);
      }

      // Re-deliver the 'start' message to the newly registered handler so it
      // can extract streamSid and initialise the upstream provider connection.
      twilioWs.emit('message', raw);
    });
  });
}
