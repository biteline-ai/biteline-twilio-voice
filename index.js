/**
 * Biteline Voice Server — Entry Point
 *
 * Fastify server providing:
 *   POST /incoming-call    → Twilio Voice webhook (TwiML response)
 *   GET  /media-stream     → Twilio Media Stream WebSocket → AI provider
 *   POST /call-status      → Twilio status callback
 *   GET  /health           → Health check
 *
 * Port: 6501 (Biteline 6500-range convention)
 */

import 'dotenv/config';
import Fastify        from 'fastify';
import fastifyWs      from '@fastify/websocket';
import fastifyForm    from '@fastify/formbody';

import { setupTwilioRoutes }     from './src/services/twilio.js';
import { setupMediaStreamRoute }  from './src/providers/router.js';
import { sessionCount }           from './src/sessions/store.js';

const PORT = Number(process.env.PORT) || 6501;
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  },
});

// ── Plugins ────────────────────────────────────────────────────────────────────
await fastify.register(fastifyForm);
await fastify.register(fastifyWs);

// ── Routes ─────────────────────────────────────────────────────────────────────
fastify.get('/health', async () => ({
  ok:            true,
  ts:            new Date().toISOString(),
  activeSessions: sessionCount(),
}));

setupTwilioRoutes(fastify);
setupMediaStreamRoute(fastify);

// ── Global error handler ────────────────────────────────────────────────────────
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error({ err: error, url: request.url }, 'Unhandled server error');
  const code = error.statusCode || 500;
  const msg  = process.env.NODE_ENV === 'production' && code >= 500
    ? 'Internal server error'
    : error.message;
  return reply.code(code).send({ error: msg });
});

// ── Start ───────────────────────────────────────────────────────────────────────
try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`Biteline Voice Server listening on ${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
