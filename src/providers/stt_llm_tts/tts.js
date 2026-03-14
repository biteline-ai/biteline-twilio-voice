/**
 * TTS (Text-to-Speech) provider adapters.
 *
 * All providers return a Buffer of audio encoded as g711_ulaw 8kHz
 * so it can be sent directly to Twilio Media Streams without transcoding.
 *
 * Supported: openai | elevenlabs | cartesia | deepgram
 *
 * Note: OpenAI TTS returns MP3 by default; we request PCM and encode to ulaw.
 * ElevenLabs, Cartesia, and Deepgram all support mulaw/ulaw output directly.
 */

// ── μ-law encoding (PCM 16-bit → mulaw 8-bit) ─────────────────────────────────
// Simple implementation for providers that return PCM.

function pcm16ToMulaw(pcmBuffer) {
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength / 2);
  const mulaw   = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i++) {
    mulaw[i] = linearToMulaw(samples[i]);
  }
  return mulaw;
}

function linearToMulaw(sample) {
  const BIAS      = 0x84;
  const CLIP      = 32635;
  const MU        = 255;
  const sign      = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exp = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exp > 0; expMask >>= 1, exp--) {}
  const mantissa = (sample >> (exp + 3)) & 0x0F;
  return ~(sign | (exp << 4) | mantissa) & 0xFF;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAudio(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TTS ${url} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── OpenAI TTS ────────────────────────────────────────────────────────────────

async function openAITTS({ apiKey, voice = 'alloy', model = 'tts-1', text }) {
  // Request PCM 24kHz (highest quality for realtime use); we downsample + encode to mulaw 8kHz
  const buf = await fetchAudio('https://api.openai.com/v1/audio/speech', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify({ model, voice, input: text, response_format: 'pcm' }),
  });

  // OpenAI PCM is 16-bit LE at 24kHz mono — downsample 3:1 to 8kHz then mulaw encode
  const pcm24 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  const pcm8  = new Int16Array(Math.floor(pcm24.length / 3));
  for (let i = 0; i < pcm8.length; i++) pcm8[i] = pcm24[i * 3];
  return pcm16ToMulaw(Buffer.from(pcm8.buffer));
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

async function elevenLabsTTS({ apiKey, voiceId = 'JBFqnCBsd6RMkjVDRZzb', text }) {
  // ElevenLabs supports ulaw_8000 output format natively
  const buf = await fetchAudio(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`,
    {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key':   apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  return buf; // Already ulaw 8kHz
}

// ── Cartesia TTS ──────────────────────────────────────────────────────────────

async function cartesiaTTS({ apiKey, voiceId = 'a0e99841-438c-4a64-b679-ae501e7d6091', text }) {
  const buf = await fetchAudio('https://api.cartesia.ai/tts/bytes', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key':    apiKey,
      'Cartesia-Version': '2024-06-10',
    },
    body: JSON.stringify({
      transcript:    text,
      model_id:      'sonic-english',
      voice:         { mode: 'id', id: voiceId },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 8000 },
    }),
  });
  // PCM 16-bit LE at 8kHz → encode to mulaw
  return pcm16ToMulaw(buf);
}

// ── Deepgram TTS ──────────────────────────────────────────────────────────────

async function deepgramTTS({ apiKey, voice = 'aura-luna-en', text }) {
  // Deepgram Aura supports mulaw encoding and 8kHz sample rate
  const url = `https://api.deepgram.com/v1/speak?model=${voice}&encoding=mulaw&sample_rate=8000`;
  const buf = await fetchAudio(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:  `Token ${apiKey}`,
    },
    body: JSON.stringify({ text }),
  });
  return buf; // Already mulaw 8kHz
}

// ── Factory ────────────────────────────────────────────────────────────────────

export async function synthesize({ provider, apiKey, voice, text }) {
  switch (provider) {
    case 'openai':
      return openAITTS({ apiKey: apiKey || process.env.OPENAI_API_KEY, voice, text });
    case 'elevenlabs':
      return elevenLabsTTS({ apiKey: apiKey || process.env.ELEVENLABS_API_KEY, voiceId: voice, text });
    case 'cartesia':
      return cartesiaTTS({ apiKey: apiKey || process.env.CARTESIA_API_KEY, voiceId: voice, text });
    case 'deepgram':
      return deepgramTTS({ apiKey: apiKey || process.env.DEEPGRAM_API_KEY, voice, text });
    default:
      console.warn(`[TTS] Unknown provider "${provider}", defaulting to openai`);
      return openAITTS({ apiKey: process.env.OPENAI_API_KEY, text });
  }
}
