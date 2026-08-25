/**
 * Autonomous Telegram Channel Manager - Main Worker Entry Point
 *
 * Cloudflare Workers TypeScript Entrypoint & REST API Router
 */

import { GeminiService } from './ai/gemini.ts';
import { getPublicConfig, isTestMode, requireAdminAuth } from './config/config.ts';
import { HealthService } from './health/health.ts';
import { IncidentManager } from './health/incidents.ts';
import { Orchestrator } from './orchestrator/orchestrator.ts';
import { createStorage } from './storage/storage.ts';
import { TelegramClient } from './telegram/client.ts';
import { TelegramWebhookHandler } from './telegram/webhook.ts';
import { Env, EventType, ExecutionContext } from './types/index.ts';
import { formatSafeErrorResponse, NotFoundError, UnauthorizedError } from './utils/errors.ts';
import { Logger } from './utils/logger.ts';
import { timingSafeEqual } from './utils/security.ts';

const logger = new Logger('WorkerEntry');
const healthService = new HealthService();

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token',
      ...headers,
    },
  });
}

/**
 * Worker application container initializing services per request/environment
 */
export function createAppContext(env: Partial<Env>) {
  const storage = createStorage(env);
  const incidentManager = new IncidentManager(storage);
  const telegramClient = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const geminiService = new GeminiService(env.GEMINI_API_KEY);
  const orchestrator = new Orchestrator(telegramClient, incidentManager, env);
  const webhookHandler = new TelegramWebhookHandler(env.TELEGRAM_WEBHOOK_SECRET, orchestrator);

  return {
    storage,
    incidentManager,
    telegramClient,
    geminiService,
    orchestrator,
    webhookHandler,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      const app = createAppContext(env);

      // ----------------------------------------------------------------------
      // 1. GET /health - Structured Health Evaluation
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/health') {
        const report = await healthService.getHealthReport(
          env,
          app.storage,
          app.geminiService,
          app.telegramClient
        );
        const httpStatus = report.status === 'unhealthy' ? 503 : 200;
        return jsonResponse(report, httpStatus);
      }

      // ----------------------------------------------------------------------
      // 2. GET /api/status - Non-sensitive Architecture and Status Overview
      // ----------------------------------------------------------------------
      if (method === 'GET' && (pathname === '/api/status' || pathname === '/status')) {
        const publicConfig = getPublicConfig(env);
        const orchestratorStatus = app.orchestrator.getStatus();
        const health = await healthService.getHealthReport(
          env,
          app.storage,
          app.geminiService,
          app.telegramClient
        );

        return jsonResponse({
          system: {
            name: 'TeleCore AI',
            editorialPhilosophy: 'Technology that matters, explained and made useful.',
            niche: 'AI + technology + automation',
            health: health.status,
            version: publicConfig.version,
            environment: publicConfig.environment,
            testMode: publicConfig.testMode,
          },
          config: publicConfig,
          orchestrator: orchestratorStatus,
          dependencies: health.dependencies,
        });
      }

      // ----------------------------------------------------------------------
      // 3. POST /webhooks/telegram - Telegram Bot Updates
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/webhooks/telegram') {
        const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'Malformed JSON payload' }, 400);
        }

        const result = await app.webhookHandler.handleWebhook(secretHeader, body);
        return jsonResponse(result, 200);
      }

      // ----------------------------------------------------------------------
      // 4. Admin Diagnostic: GET or POST /api/admin/telegram/verify
      // ----------------------------------------------------------------------
      if ((method === 'GET' || method === 'POST') && pathname === '/api/admin/telegram/verify') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'verify Telegram channel');

        const targetChannel = env.TELEGRAM_CHANNEL_ID;
        const verification = await app.telegramClient.verifyChannelAccess(targetChannel);

        return jsonResponse({
          ok: verification.bot === 'connected',
          verification,
        });
      }

      // ----------------------------------------------------------------------
      // 5. Admin Action: POST /api/admin/telegram/test-publish (Owner-Initiated)
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/api/admin/telegram/test-publish') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'publish test messages');

        if (!env.TELEGRAM_CHANNEL_ID || env.TELEGRAM_CHANNEL_ID.trim().length === 0) {
          return jsonResponse({
            ok: false,
            error: 'TELEGRAM_CHANNEL_ID is not configured. Please set the channel username (e.g. @your_channel) or channel ID in environment bindings.',
          }, 400);
        }

        let body: { message?: string; parse_mode?: 'Markdown' | 'HTML' | 'MarkdownV2'; disable_notification?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: 'Malformed JSON payload' }, 400);
        }

        const messageText = body.message?.trim();
        if (!messageText || messageText.length === 0) {
          return jsonResponse({ error: 'Field "message" cannot be empty' }, 400);
        }

        if (messageText.length > 4096) {
          return jsonResponse({
            error: `Message length (${messageText.length}) exceeds Telegram limit of 4096 characters`,
          }, 400);
        }

        const validParseModes = ['Markdown', 'HTML', 'MarkdownV2'] as const;
        const parseMode = body.parse_mode && validParseModes.includes(body.parse_mode as any)
          ? body.parse_mode
          : undefined;

        // Perform owner-authenticated publication
        const telegramMessage = await app.telegramClient.sendMessage(
          env.TELEGRAM_CHANNEL_ID.trim(),
          messageText,
          {
            parse_mode: parseMode,
            disable_notification: Boolean(body.disable_notification),
          }
        );

        // Record event in orchestrator
        await app.orchestrator.publish(
          'content.published',
          {
            messageId: telegramMessage.message_id,
            chatId: telegramMessage.chat.id,
            publishedAt: Date.now(),
            manualTest: true,
          },
          `manual-test-${telegramMessage.message_id}`
        );

        return jsonResponse({
          ok: true,
          message: 'Manual test message published to Telegram channel successfully',
          manualTest: true,
          isOwnerInitiated: true,
          testModeActive: isTestMode(env),
          result: {
            messageId: telegramMessage.message_id,
            chatId: telegramMessage.chat.id,
            channelTitle: telegramMessage.chat.title || telegramMessage.chat.username,
            date: telegramMessage.date,
            publishedAt: Date.now(),
          },
        });
      }

      // ----------------------------------------------------------------------
      // 6. Admin Action: GET /api/admin/telegram/webhook-info
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/admin/telegram/webhook-info') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'view webhook info');

        const info = await app.telegramClient.getWebhookInfo();
        return jsonResponse({
          ok: true,
          webhookInfo: info,
        });
      }

      // ----------------------------------------------------------------------
      // 7. Admin Action: POST /api/admin/telegram/setup-webhook
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/api/admin/telegram/setup-webhook') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'register webhook');

        let body: { webhookUrl?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // body is optional
        }

        const targetUrl = (body.webhookUrl || (env.APP_URL ? `${env.APP_URL.replace(/\/+$/, '')}/webhooks/telegram` : '')).trim();

        if (!targetUrl || !targetUrl.startsWith('https://')) {
          return jsonResponse({
            ok: false,
            error: 'Webhook URL must be a valid public HTTPS URL (e.g. https://telecore-ai.workers.dev/webhooks/telegram).',
          }, 400);
        }

        if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1') || targetUrl.includes('0.0.0.0')) {
          return jsonResponse({
            ok: false,
            error: 'Localhost URLs cannot receive webhooks from Telegram. Provide your deployed Cloudflare Worker HTTPS domain.',
          }, 400);
        }

        await app.telegramClient.setWebhook(targetUrl, env.TELEGRAM_WEBHOOK_SECRET);

        return jsonResponse({
          ok: true,
          message: 'Telegram webhook registered successfully',
          webhookUrl: targetUrl,
        });
      }

      // ----------------------------------------------------------------------
      // 8. Admin Action: POST /api/admin/telegram/delete-webhook
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/api/admin/telegram/delete-webhook') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'delete webhook');

        await app.telegramClient.deleteWebhook(true);

        return jsonResponse({
          ok: true,
          message: 'Telegram webhook deleted successfully (pending updates dropped)',
        });
      }

      // ----------------------------------------------------------------------
      // 9. Protected Route: GET /api/admin/incidents - List Recorded Incidents
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/admin/incidents') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'view incident records');

        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const incidents = await app.incidentManager.listIncidents(limit);
        return jsonResponse({
          total: incidents.length,
          incidents,
        });
      }

      // ----------------------------------------------------------------------
      // 10. Test/Dev Route: POST /api/test/event - Dispatch Pipeline Test Event
      // ----------------------------------------------------------------------
      if (method === 'POST' && pathname === '/api/test/event') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'trigger test events');

        let body: { eventType?: EventType; payload?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: 'Malformed JSON body' }, 400);
        }

        const targetType = body.eventType || 'research.requested';
        const payload = body.payload || {
          niche: 'AI + technology + automation',
          topic: 'Autonomous Cloudflare Worker Architecture',
        };

        const event = await app.orchestrator.publish(targetType, payload);
        return jsonResponse({
          ok: true,
          message: `Event '${targetType}' processed successfully`,
          event,
          orchestrator: app.orchestrator.getStatus(),
        });
      }

      // ----------------------------------------------------------------------
      // 11. Temporary Diagnostic Route: GET /api/admin/run-test
      // TODO: TEMPORARY ENDPOINT - REMOVE AFTER MOBILE BROWSER TESTING IS COMPLETED
      // Allows owner to trigger existing deterministic pipeline test from browser without terminal access
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/admin/run-test') {
        const providedSecret = url.searchParams.get('secret');

        if (
          !providedSecret ||
          !env.ADMIN_SECRET ||
          env.ADMIN_SECRET.trim().length === 0 ||
          !timingSafeEqual(providedSecret.trim(), env.ADMIN_SECRET.trim())
        ) {
          throw new UnauthorizedError('Valid ADMIN_SECRET query parameter "secret" is required.');
        }

        // Execute existing deterministic pipeline test event (research.requested -> researcher -> content.requested)
        const targetType: EventType = 'research.requested';
        const payload = {
          niche: 'AI + technology + automation',
          topic: 'Autonomous Cloudflare Worker Architecture',
          isPipelineTest: true,
        };

        const event = await app.orchestrator.publish(targetType, payload);

        return jsonResponse({
          ok: true,
          message: `Pipeline test event '${targetType}' triggered successfully`,
          testModeActive: isTestMode(env),
          autonomousPublishingAllowed: false,
          event: {
            id: event.id,
            type: event.type,
            timestamp: event.timestamp,
            correlationId: event.correlationId,
            payload: event.payload,
          },
          orchestrator: app.orchestrator.getStatus(),
        });
      }

      // Root endpoint fallback
      if (method === 'GET' && pathname === '/') {
        const publicConfig = getPublicConfig(env);
        return jsonResponse({
          service: 'TeleCore AI - Autonomous Telegram Channel Manager',
          phase: 'Telegram Integration & Foundation Phase',
          version: publicConfig.version,
          status: 'online',
          testMode: publicConfig.testMode,
          endpoints: [
            'GET  /health',
            'GET  /api/status',
            'POST /webhooks/telegram',
            'GET  /api/admin/telegram/verify',
            'POST /api/admin/telegram/test-publish',
            'GET  /api/admin/telegram/webhook-info',
            'POST /api/admin/telegram/setup-webhook',
            'POST /api/admin/telegram/delete-webhook',
            'GET  /api/admin/incidents',
            'POST /api/test/event',
          ],
        });
      }

      throw new NotFoundError(`Endpoint not found: ${method} ${pathname}`);
    } catch (err) {
      logger.error('request_error', `Unhandled request failure on ${method} ${pathname}`, {
        error: err,
      });
      const safeError = formatSafeErrorResponse(err, env.ENVIRONMENT);
      return jsonResponse(safeError, safeError.error.statusCode);
    }
  },
};
