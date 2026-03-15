/**
 * STT (Speech-to-Text) provider adapters.
 *
 * Supported providers: deepgram | groq | openai
 *
 * Deepgram (default): streaming WebSocket that accepts mulaw 8kHz directly.
 *   Fast, low-latency, real-time transcript delivery.
 *
 * Groq / OpenAI Whisper: chunk-accumulate mode.  Audio is buffered while
 * speaking, then the accumulated mulaw is sent to Whisper on silence/turn-end.
 */

import WebSocket from 'ws';

// ── Deepgram streaming STT ────────────────────────────────────────────────────

/**
 * Open a Deepgram streaming connection.
 * Returns an object with { send(base64mulaw), close(), onTranscript(text) }.
 *
 * @param {object}   opts
 * @param {string}   opts.apiKey
 * @param {function} opts.onTranscript  - called with final transcript string
 * @param {function} opts.onError       - called on errors
 */
export function createDeepgramSTT({ apiKey, onTranscript, onError }) {
  const params = new URLSearchParams({
    model:       'nova-3',
    encoding:    'mulaw',
    sample_rate: '8000',
    channels:    '1',
    smart_format: 'true',
    interim_results: 'true',
    utterance_end_ms: '1000',   // 1s silence → utterance end event
    vad_events: 'true',
  });

  const url = `wss://api.deepgram.com/v1/listen?${params}`;
  const ws  = new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } });

  ws.on('open', () => {
    console.log('[DG-STT] Connected');
  });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // Final transcript from an utterance
    if (data.type === 'Results' && data.is_final) {
      const text = data.channel?.alternatives?.[0]?.transcript?.trim();
      if (text) onTranscript(text);
    }

    // Utterance end (silence detected) — already handled by is_final above
  });

  ws.on('error', (err) => {
    console.error('[DG-STT] Error:', err.message);
    if (onError) onError(err);
  });

  ws.on('close', () => console.log('[DG-STT] Closed'));

  return {
    /** Send a base64-encoded mulaw audio chunk */
    send(base64audio) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from(base64audio, 'base64'));
      }
    },
    close() {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}

// ── Groq Whisper (accumulate + transcribe) ─────────────────────────────────────

/**
 * Accumulate mulaw audio chunks; transcribe via Groq Whisper on demand.
 */
export function createGroqSTT({ apiKey }) {
  const chunks = [];

  return {
    send(base64audio) {
      chunks.push(Buffer.from(base64audio, 'base64'));
    },

    async transcribe() {
      if (!chunks.length) return '';
      const mulaw = Buffer.concat(chunks);
      chunks.length = 0;

      // Groq Whisper accepts audio files — we ship as audio/basic (mulaw 8kHz)
      const form = new globalThis.FormData();
      const blob = new Blob([mulaw], { type: 'audio/basic' });
      form.append('file', blob, 'audio.ul');
      form.append('model', 'whisper-large-v3-turbo');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body:    form,
      });
      if (!res.ok) {
        console.error('[Groq STT] Transcription failed:', res.status, await res.text().catch(() => ''));
        return '';
      }
      const data = await res.json();
      return data.text?.trim() || '';
    },

    close() {},
  };
}

// ── OpenAI Whisper (accumulate + transcribe) ───────────────────────────────────

export function createOpenAISTT({ apiKey }) {
  const chunks = [];

  return {
    send(base64audio) {
      chunks.push(Buffer.from(base64audio, 'base64'));
    },

    async transcribe() {
      if (!chunks.length) return '';
      const mulaw = Buffer.concat(chunks);
      chunks.length = 0;

      const form = new globalThis.FormData();
      const blob = new Blob([mulaw], { type: 'audio/basic' });
      form.append('file', blob, 'audio.ul');
      form.append('model', 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body:    form,
      });
      if (!res.ok) {
        console.error('[OpenAI STT] Transcription failed:', res.status, await res.text().catch(() => ''));
        return '';
      }
      const data = await res.json();
      return data.text?.trim() || '';
    },

    close() {},
  };
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createSTT(provider, opts) {
  switch (provider) {
    case 'deepgram': return createDeepgramSTT(opts);
    case 'groq':     return createGroqSTT(opts);
    case 'openai':   return createOpenAISTT(opts);
    default:
      console.warn(`[STT] Unknown provider "${provider}", defaulting to deepgram`);
      return createDeepgramSTT(opts);
  }
}
