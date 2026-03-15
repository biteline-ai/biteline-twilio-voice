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
import { pool }                   from './src/db/pool.js';

const PORT      = Number(process.env.PORT) || 6501;
const HOST      = process.env.HOST || '0.0.0.0';
const startedAt = new Date().toISOString();

// ── Request counters ──────────────────────────────────────────────────────────
const counters = { total: 0, '4xx': 0, '5xx': 0 };

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

// ── Request counter hook ───────────────────────────────────────────────────────
fastify.addHook('onResponse', (request, reply, done) => {
  counters.total++;
  const code = reply.statusCode;
  if (code >= 500) counters['5xx']++;
  else if (code >= 400) counters['4xx']++;
  done();
});

// ── Routes ─────────────────────────────────────────────────────────────────────
fastify.get('/health', async () => ({
  ok:             true,
  ts:             new Date().toISOString(),
  activeSessions: sessionCount(),
}));

fastify.get('/metrics', async () => {
  const mem = process.memoryUsage();
  const mb  = (bytes) => Math.round(bytes / 1024 / 1024 * 10) / 10;
  return {
    ts:              new Date().toISOString(),
    started_at:      startedAt,
    uptime_seconds:  Math.round(process.uptime()),
    active_sessions: sessionCount(),
    memory: {
      rss_mb:        mb(mem.rss),
      heap_used_mb:  mb(mem.heapUsed),
      heap_total_mb: mb(mem.heapTotal),
    },
    requests: {
      total: counters.total,
      '4xx': counters['4xx'],
      '5xx': counters['5xx'],
    },
    node_version: process.version,
  };
});

// ── Prometheus text-format metrics ───────────────────────────────────────────
// Compatible with Prometheus scraping (Content-Type: text/plain; version=0.0.4)
// Grafana agent, Victoria Metrics, or any OpenMetrics-compatible scraper can
// consume this endpoint directly.
fastify.get('/metrics/prometheus', async (_request, reply) => {
  const mem     = process.memoryUsage();
  const uptime  = Math.round(process.uptime());
  const active  = sessionCount();

  const lines = [
    '# HELP biteline_voice_uptime_seconds Server uptime in seconds',
    '# TYPE biteline_voice_uptime_seconds gauge',
    `biteline_voice_uptime_seconds ${uptime}`,

    '# HELP biteline_voice_active_sessions Currently active call sessions',
    '# TYPE biteline_voice_active_sessions gauge',
    `biteline_voice_active_sessions ${active}`,

    '# HELP biteline_voice_memory_rss_bytes Resident set size in bytes',
    '# TYPE biteline_voice_memory_rss_bytes gauge',
    `biteline_voice_memory_rss_bytes ${mem.rss}`,

    '# HELP biteline_voice_memory_heap_used_bytes V8 heap used in bytes',
    '# TYPE biteline_voice_memory_heap_used_bytes gauge',
    `biteline_voice_memory_heap_used_bytes ${mem.heapUsed}`,

    '# HELP biteline_voice_memory_heap_total_bytes V8 heap total in bytes',
    '# TYPE biteline_voice_memory_heap_total_bytes gauge',
    `biteline_voice_memory_heap_total_bytes ${mem.heapTotal}`,

    '# HELP biteline_voice_requests_total Total HTTP requests served',
    '# TYPE biteline_voice_requests_total counter',
    `biteline_voice_requests_total{status="all"} ${counters.total}`,
    `biteline_voice_requests_total{status="4xx"} ${counters['4xx']}`,
    `biteline_voice_requests_total{status="5xx"} ${counters['5xx']}`,
  ];

  return reply
    .type('text/plain; version=0.0.4; charset=utf-8')
    .send(lines.join('\n') + '\n');
});

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
  // Verify database connectivity before accepting traffic
  await pool.query('SELECT 1');
  fastify.log.info('Database connection verified');

  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`Biteline Voice Server listening on ${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
