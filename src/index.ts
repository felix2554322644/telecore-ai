/**
 * Autonomous Telegram Channel Manager - Main Worker Entry Point
 *
 * Cloudflare Workers TypeScript Entrypoint & REST API Router
 */

import { GeminiService } from './ai/gemini.ts';
import { getPublicConfig, isTestMode, requireAdminAuth } from './config/config.ts';
import { CandidateManager } from './health/candidates.ts';
import { HealthService } from './health/health.ts';
import { IncidentManager } from './health/incidents.ts';
import { Orchestrator } from './orchestrator/orchestrator.ts';
import { ProductionControlManager } from './safety/productionControl.ts';
import { IntelligentScheduler } from './scheduler/intelligentScheduler.ts';
import { createStorage } from './storage/storage.ts';
import { TelegramClient } from './telegram/client.ts';
import { TelegramWebhookHandler } from './telegram/webhook.ts';
import { Env, EventType, ExecutionContext, ProductionSafetyConfig, ScheduledEvent } from './types/index.ts';
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
  const candidateManager = new CandidateManager(storage);
  const productionControl = new ProductionControlManager(storage, env);
  const telegramClient = (env as any)?.__TELEGRAM_CLIENT__ || new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const geminiService = (env as any)?.__GEMINI_SERVICE__ || new GeminiService(env.GEMINI_API_KEY);
  const orchestrator = new Orchestrator(
    telegramClient,
    incidentManager,
    env,
    candidateManager,
    geminiService,
    storage,
    productionControl
  );
  const webhookHandler = new TelegramWebhookHandler(env.TELEGRAM_WEBHOOK_SECRET, orchestrator);
  const scheduler = new IntelligentScheduler(
    storage,
    orchestrator,
    candidateManager,
    incidentManager,
    geminiService
  );

  return {
    storage,
    incidentManager,
    candidateManager,
    productionControl,
    telegramClient,
    geminiService,
    orchestrator,
    webhookHandler,
    scheduler,
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
        const publicConfig = getPublicConfig(env, request.url);
        const orchestratorStatus = app.orchestrator.getStatus();
        const health = await healthService.getHealthReport(
          env,
          app.storage,
          app.geminiService,
          app.telegramClient
        );
        const incidents = await app.incidentManager.listIncidents(20);
        const candidateStats = await app.candidateManager.getCandidateStats();
        const recentCandidates = await app.candidateManager.listCandidates(5);
        const schedulerStatus = await app.scheduler.getStatus();
        const controlState = await app.productionControl.getControlState();
        const recentAuditDecisions = await app.productionControl.listDecisionLogs({ limit: 5 });

        return jsonResponse({
          system: {
            name: 'TeleCore AI',
            editorialPhilosophy: 'Technology that matters, explained and made useful.',
            niche: 'AI + technology + automation',
            health: health.status,
            version: publicConfig.version,
            environment: publicConfig.environment,
            testMode: publicConfig.testMode,
            shadowMode: {
              enabled: true,
              autonomousPublishingAllowed: false,
              testModeActive: isTestMode(env),
            },
          },
          config: publicConfig,
          control: {
            killSwitchActive: controlState.killSwitchActive,
            killSwitchReason: controlState.killSwitchReason,
            autonomousPublishingState: controlState.autonomousPublishingState,
            rateLimitStatus: {
              publishedThisHour: controlState.publicationsThisHour || 0,
              maxPostsPerHour: controlState.safetyConfig.maxPostsPerHour,
              lastPublishedAt: controlState.lastPublishedAt,
            },
            safeguards: {
              minQualityThreshold: controlState.safetyConfig.minQualityThreshold,
              minConfidenceThreshold: controlState.safetyConfig.minConfidenceThreshold,
              enforceStrictFactCheck: controlState.safetyConfig.enforceStrictFactCheck,
            },
          },
          audit: {
            recentDecisionsCount: recentAuditDecisions.length,
            recentDecisions: recentAuditDecisions,
          },
          orchestrator: orchestratorStatus,
          candidates: {
            stats: candidateStats,
            recent: recentCandidates,
          },
          scheduler: schedulerStatus,
          feedback: schedulerStatus?.feedbackSummary,
          dependencies: health.dependencies,
          incidents,
        });
      }

      // ----------------------------------------------------------------------
      // 2b. GET /api/control/status - Production Control & Safeguards State
      // ----------------------------------------------------------------------
      if (method === 'GET' && (pathname === '/api/control/status' || pathname === '/api/admin/control/status' || pathname === '/api/control')) {
        if (pathname.includes('/admin/')) {
          const authHeader = request.headers.get('Authorization');
          requireAdminAuth(authHeader, env, 'view admin control status');
        }

        const controlState = await app.productionControl.getControlState();
        const recentAuditDecisions = await app.productionControl.listDecisionLogs({ limit: 10 });
        return jsonResponse({
          ok: true,
          state: controlState,
          recentAuditDecisions,
          testModeActive: isTestMode(env),
        });
      }

      // ----------------------------------------------------------------------
      // 2c. POST /api/admin/control/kill-switch - Owner Global Kill Switch Toggle
      // ----------------------------------------------------------------------
      if (method === 'POST' && (pathname === '/api/admin/control/kill-switch' || pathname === '/api/control/kill-switch')) {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'toggle global kill switch');

        let body: { active?: boolean; reason?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: 'Malformed JSON payload' }, 400);
        }

        if (typeof body.active !== 'boolean') {
          return jsonResponse({ error: 'Field "active" (boolean) is required' }, 400);
        }

        const updatedState = await app.productionControl.setKillSwitch(
          body.active,
          body.reason,
          'owner:admin'
        );

        await app.orchestrator.publish(
          'control.kill_switch_toggled',
          { active: body.active, reason: body.reason, state: updatedState }
        );

        return jsonResponse({
          ok: true,
          message: body.active
            ? 'Global kill switch ENGAGED. All autonomous and publishing activity halted.'
            : 'Global kill switch DISENGAGED. Normal safeguard operations resumed.',
          state: updatedState,
        });
      }

      // ----------------------------------------------------------------------
      // 2d. POST /api/admin/control/autonomous-publishing - Autonomous State Control
      // ----------------------------------------------------------------------
      if (method === 'POST' && (pathname === '/api/admin/control/autonomous-publishing' || pathname === '/api/control/autonomous-publishing')) {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'change autonomous publishing state');

        let body: { state?: 'disabled' | 'armed' | 'standby' } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: 'Malformed JSON payload' }, 400);
        }

        const validStates = ['disabled', 'armed', 'standby'];
        if (!body.state || !validStates.includes(body.state)) {
          return jsonResponse({ error: `Field "state" must be one of: ${validStates.join(', ')}` }, 400);
        }

        const updatedState = await app.productionControl.setAutonomousPublishingState(
          body.state,
          'owner:admin'
        );

        await app.orchestrator.publish(
          'control.autonomous_state_changed',
          { state: body.state, controlState: updatedState }
        );

        return jsonResponse({
          ok: true,
          message: `Autonomous publishing state transitioned to '${body.state}'`,
          state: updatedState,
        });
      }

      // ----------------------------------------------------------------------
      // 2e. POST /api/admin/control/safety-config - Update Safeguard Thresholds
      // ----------------------------------------------------------------------
      if (method === 'POST' && (pathname === '/api/admin/control/safety-config' || pathname === '/api/control/safety-config')) {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'update safety configuration');

        let body: Partial<ProductionSafetyConfig> = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: 'Malformed JSON payload' }, 400);
        }

        const updatedState = await app.productionControl.updateSafetyConfig(body, 'owner:admin');

        return jsonResponse({
          ok: true,
          message: 'Production safety configuration updated successfully',
          state: updatedState,
        });
      }

      // ----------------------------------------------------------------------
      // 2f. GET /api/audit-logs - Query Immutable Pipeline Decision Logs
      // ----------------------------------------------------------------------
      if (method === 'GET' && (pathname === '/api/audit-logs' || pathname === '/api/admin/audit-logs')) {
        if (pathname.includes('/admin/')) {
          const authHeader = request.headers.get('Authorization');
          requireAdminAuth(authHeader, env, 'view audit decision logs');
        }

        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const category = (url.searchParams.get('category') || undefined) as any;
        const decision = url.searchParams.get('decision') || undefined;

        const logs = await app.productionControl.listDecisionLogs({ limit, category, decision });
        return jsonResponse({
          total: logs.length,
          logs,
        });
      }

      // ----------------------------------------------------------------------
      // 2g. GET /api/audit-logs/:id - Single Audit Decision Detail
      // ----------------------------------------------------------------------
      if (method === 'GET' && (pathname.startsWith('/api/audit-logs/') || pathname.startsWith('/api/admin/audit-logs/'))) {
        const id = pathname.replace(/^\/api\/(admin\/)?audit-logs\//, '');
        const log = await app.productionControl.getDecisionLog(id);
        if (!log) {
          throw new NotFoundError(`Audit decision log entry not found: ${id}`);
        }
        return jsonResponse({ ok: true, log });
      }

      // ----------------------------------------------------------------------
      // 3. GET /api/analytics/feedback - Feedback & Learning Loop Report
      // ----------------------------------------------------------------------
      if (method === 'GET' && (pathname === '/api/analytics/feedback' || pathname === '/api/admin/analytics/feedback')) {
        if (pathname === '/api/admin/analytics/feedback') {
          const authHeader = request.headers.get('Authorization');
          requireAdminAuth(authHeader, env, 'view admin feedback learning report');
        }

        const report = await app.orchestrator.analyst.getFeedbackReport();
        return jsonResponse({
          ok: true,
          report,
          shadowMode: true,
        });
      }

      // ----------------------------------------------------------------------
      // 3b. POST /api/analytics/feedback/refresh - Force Recalculate Feedback Metrics
      // ----------------------------------------------------------------------
      if (method === 'POST' && (pathname === '/api/analytics/feedback/refresh' || pathname === '/api/admin/analytics/feedback/refresh')) {
        const authHeader = request.headers.get('Authorization');
        if (pathname === '/api/admin/analytics/feedback/refresh' || (authHeader && env.ADMIN_SECRET)) {
          requireAdminAuth(authHeader, env, 'refresh feedback learning metrics');
        }

        const report = await app.orchestrator.analyst.generateFeedbackReport();
        await app.orchestrator.publish('analytics.feedback_updated', report);

        return jsonResponse({
          ok: true,
          message: `Feedback analysis refreshed across ${report.totalEvaluatedCandidates} candidates and ${Object.keys(report.clusterPerformance).length} clusters`,
          report,
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

        // Check global kill switch
        const isKillActive = await app.productionControl.isKillSwitchActive();
        if (isKillActive) {
          const controlState = await app.productionControl.getControlState();
          return jsonResponse({
            ok: false,
            error: `Publishing blocked: Global kill switch is ACTIVE (${controlState.killSwitchReason || 'Emergency stop'})`,
            killSwitchActive: true,
          }, 403);
        }

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

        // Record successful publication in production control & audit
        await app.productionControl.recordPublicationSuccess(
          env.TELEGRAM_CHANNEL_ID.trim(),
          `manual-${telegramMessage.message_id}`,
          `manual-test-${telegramMessage.message_id}`
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

        const defaultTargetUrl = env.APP_URL
          ? `${env.APP_URL.replace(/\/+$/, '')}/webhooks/telegram`
          : (url.origin.startsWith('https://') ? `${url.origin}/webhooks/telegram` : '');
        const targetUrl = (body.webhookUrl || defaultTargetUrl).trim();

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
      // 9a. Public Telemetry: GET /api/incidents - Non-sensitive Incident Log
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/incidents') {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const incidents = await app.incidentManager.listIncidents(limit);
        return jsonResponse({
          total: incidents.length,
          incidents,
        });
      }

      // ----------------------------------------------------------------------
      // 9b. Protected Route: GET /api/admin/incidents - Admin Incident Records
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
      // 9c. Public Telemetry: GET /api/candidates - Non-sensitive Candidate Log
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/candidates') {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const statusParam = url.searchParams.get('status') as 'approved' | 'rejected' | undefined;
        const candidates = await app.candidateManager.listCandidates(limit, statusParam);
        const stats = await app.candidateManager.getCandidateStats();
        return jsonResponse({
          total: candidates.length,
          stats,
          candidates,
        });
      }

      // ----------------------------------------------------------------------
      // 9d. Protected Route: GET /api/admin/candidates - Admin Candidate Records
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname === '/api/admin/candidates') {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'view candidate records');

        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const statusParam = url.searchParams.get('status') as 'approved' | 'rejected' | undefined;
        const candidates = await app.candidateManager.listCandidates(limit, statusParam);
        const stats = await app.candidateManager.getCandidateStats();
        return jsonResponse({
          total: candidates.length,
          stats,
          candidates,
        });
      }

      // ----------------------------------------------------------------------
      // 9e. Protected Route: GET /api/admin/candidates/:id - Single Candidate
      // ----------------------------------------------------------------------
      if (method === 'GET' && pathname.startsWith('/api/admin/candidates/')) {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'view candidate details');

        const candidateId = pathname.replace('/api/admin/candidates/', '');
        const candidate = await app.candidateManager.getCandidate(candidateId);
        if (!candidate) {
          throw new NotFoundError(`Candidate not found: ${candidateId}`);
        }
        return jsonResponse({ candidate });
      }

      // ----------------------------------------------------------------------
      // 9f. Phase 13 Controlled Live Publishing: POST /api/admin/publish-candidate or /api/admin/candidates/:id/publish
      // Strictly owner-authorized, one-post live publishing of ONE existing approved shadow candidate
      // Re-evaluates all 10 pre-publication safeguards, enforces anti-replay, and logs full audit trail.
      // ----------------------------------------------------------------------
      if (
        method === 'POST' &&
        (pathname === '/api/admin/publish-candidate' ||
          (pathname.startsWith('/api/admin/candidates/') && pathname.endsWith('/publish')))
      ) {
        const authHeader = request.headers.get('Authorization');
        requireAdminAuth(authHeader, env, 'publish approved shadow candidate');

        let body: { candidateId?: string; targetChannel?: string; correlationId?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // Body is optional if candidateId is in route path
          body = {};
        }

        // Extract candidateId from route path or JSON body
        let candidateId = body.candidateId?.trim();
        if (!candidateId && pathname.startsWith('/api/admin/candidates/') && pathname.endsWith('/publish')) {
          candidateId = pathname
            .replace('/api/admin/candidates/', '')
            .replace('/publish', '')
            .trim();
        }

        if (!candidateId || candidateId.length === 0) {
          return jsonResponse({ error: 'Field "candidateId" is required' }, 400);
        }

        const correlationId = body.correlationId || `owner_pub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        // 1. Fetch Candidate
        const candidate = await app.candidateManager.getCandidate(candidateId);
        if (!candidate) {
          throw new NotFoundError(`Candidate not found: ${candidateId}`);
        }

        // 2. Anti-Replay / Duplicate Publication Check
        if (candidate.status === 'published' || candidate.publishedAt || candidate.publishedMessageId) {
          const replayReason = `Duplicate/replay publication prevented: Candidate ${candidateId} was already published at ${new Date(candidate.publishedAt || candidate.timestamp).toISOString()} (Message ID: ${candidate.publishedMessageId || 'N/A'})`;
          logger.warn('duplicate_publish_attempt_blocked', replayReason, {
            correlationId,
            context: { candidateId, publishedAt: candidate.publishedAt, messageId: candidate.publishedMessageId },
          });

          await app.productionControl.recordDecisionLog({
            category: 'pre_publish_gate',
            decision: 'BLOCK',
            reason: replayReason,
            actor: 'owner:admin',
            targetContentId: candidateId,
            targetChannelId: body.targetChannel || env.TELEGRAM_CHANNEL_ID,
            correlationId,
            metadata: {
              antiReplayViolation: true,
              candidateStatus: candidate.status,
              existingMessageId: candidate.publishedMessageId,
              existingPublishedAt: candidate.publishedAt,
            },
          });

          return jsonResponse({
            ok: false,
            error: replayReason,
            candidateId,
            alreadyPublished: true,
            publishedAt: candidate.publishedAt,
            messageId: candidate.publishedMessageId,
          }, 409);
        }

        // 3. Status Verification: Candidate must be in 'approved' status
        if (candidate.status !== 'approved') {
          const unapprovedReason = `Candidate ${candidateId} cannot be published because its status is '${candidate.status}' (rejection: ${candidate.rejectionReason || candidate.rejectionCode || 'Quality thresholds not satisfied'}). Only 'approved' candidates may be published.`;
          logger.warn('unapproved_publish_attempt_blocked', unapprovedReason, {
            correlationId,
            context: { candidateId, status: candidate.status },
          });

          await app.productionControl.recordDecisionLog({
            category: 'pre_publish_gate',
            decision: 'REJECT',
            reason: unapprovedReason,
            actor: 'owner:admin',
            targetContentId: candidateId,
            targetChannelId: body.targetChannel || env.TELEGRAM_CHANNEL_ID,
            correlationId,
            metadata: { candidateStatus: candidate.status, rejectionReason: candidate.rejectionReason },
          });

          return jsonResponse({
            ok: false,
            error: unapprovedReason,
            candidateId,
            status: candidate.status,
            rejectionReason: candidate.rejectionReason,
            rejectionCode: candidate.rejectionCode,
          }, 400);
        }

        // 4. Determine Target Channel
        const targetChannel = (body.targetChannel || env.TELEGRAM_CHANNEL_ID || '').trim();

        // 5. Re-check All Pre-Publication Safeguard Gates & Dispatch via existing PublisherAgent
        const publishResult = await app.orchestrator.publisher.execute(
          {
            contentId: candidate.id,
            channelId: targetChannel,
            formattedText: candidate.draftText,
            isManualTest: true,
            qualityScore: candidate.qualityScore,
            confidenceScore: candidate.confidenceScore,
            factCheckPassed: candidate.status === 'approved' && (!candidate.claimsVerified || candidate.claimsVerified.every((c) => c.verified !== false)),
            claimsVerifiedCount: candidate.claimsVerified?.length || 0,
            actor: 'owner:admin',
          },
          correlationId
        );

        if (!publishResult.success) {
          return jsonResponse({
            ok: false,
            error: publishResult.error || 'Failed to publish candidate due to safeguard gate failure',
            candidateId: candidate.id,
            gateResult: publishResult.metadata?.gateResult,
          }, 403);
        }

        // 6. Record and Persist Published State (Anti-Replay Lock)
        const publishedMessageId = publishResult.data?.messageId ?? 0;
        const publishedAt = publishResult.data?.publishedAt ?? Date.now();

        const updatedCandidate = await app.candidateManager.markCandidatePublished(candidate.id, {
          messageId: publishedMessageId,
          channelId: targetChannel,
          publishedAt,
          publishedBy: 'owner:admin',
          correlationId,
        });

        // 7. Dispatch Event through Orchestrator
        await app.orchestrator.publish(
          'content.published',
          {
            contentId: candidate.id,
            messageId: publishedMessageId,
            channelId: targetChannel,
            publishedAt,
            manualControlledPublish: true,
            candidate: updatedCandidate,
          },
          correlationId
        );

        return jsonResponse({
          ok: true,
          message: `Controlled candidate "${candidate.topic}" published successfully to Telegram channel ${targetChannel}`,
          candidateId: candidate.id,
          messageId: publishedMessageId,
          channelId: targetChannel,
          publishedAt,
          gateResult: publishResult.metadata?.gateResult,
          candidate: updatedCandidate,
        });
      }

      // ----------------------------------------------------------------------
      // 10. Scheduler Telemetry & Trigger Routes
      // ----------------------------------------------------------------------
      if (method === 'GET' && (pathname === '/api/scheduler' || pathname === '/api/admin/scheduler')) {
        const schedulerStatus = await app.scheduler.getStatus();
        return jsonResponse({
          ok: true,
          scheduler: schedulerStatus,
          shadowMode: true,
          testModeActive: isTestMode(env),
        });
      }

      if (method === 'POST' && (pathname === '/api/scheduler/run' || pathname === '/api/admin/scheduler/run')) {
        const authHeader = request.headers.get('Authorization');
        if (pathname.includes('/admin/') || (authHeader && env.ADMIN_SECRET)) {
          requireAdminAuth(authHeader, env, 'trigger scheduled cycle');
        }

        const result = await app.scheduler.executeScheduledCycle({
          isManualTrigger: true,
          correlationId: `admin_trigger_${Date.now()}`,
        });

        return jsonResponse({
          ok: result.success,
          message: result.success
            ? `Intelligent shadow cycle executed successfully for topic: "${result.topic}"`
            : `Scheduled shadow cycle failed: ${result.error}`,
          topic: result.topic,
          category: result.category,
          cycle: result.cycleRecord,
          shadowMode: true,
          testModeActive: isTestMode(env),
          error: result.error,
        }, result.success ? 200 : 500);
      }

      // ----------------------------------------------------------------------
      // 11. Test/Dev Route: POST /api/test/event - Dispatch Pipeline Test Event
      // ----------------------------------------------------------------------
      if (method === 'POST' && (pathname === '/api/test/event' || pathname === '/api/admin/test/event')) {
        const authHeader = request.headers.get('Authorization');
        if (pathname === '/api/admin/test/event' || (authHeader && env.ADMIN_SECRET)) {
          requireAdminAuth(authHeader, env, 'trigger test events');
        }

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
      // 12. Temporary Diagnostic Route: GET /api/admin/run-test
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
        const publicConfig = getPublicConfig(env, request.url);
        return jsonResponse({
          service: 'TeleCore AI - Autonomous Telegram Channel Manager',
          phase: 'Phase 13: Controlled Live Publishing Readiness (Owner-Authorized One-Post Gate)',
          version: publicConfig.version,
          status: 'online',
          testMode: publicConfig.testMode,
          shadowMode: true,
          endpoints: [
            'GET  /health',
            'GET  /api/status',
            'GET  /api/control/status',
            'POST /api/admin/control/kill-switch',
            'POST /api/admin/control/autonomous-publishing',
            'POST /api/admin/control/safety-config',
            'GET  /api/audit-logs',
            'GET  /api/audit-logs/:id',
            'POST /webhooks/telegram',
            'GET  /api/admin/telegram/verify',
            'POST /api/admin/telegram/test-publish',
            'POST /api/admin/publish-candidate',
            'POST /api/admin/candidates/:id/publish',
            'GET  /api/admin/telegram/webhook-info',
            'POST /api/admin/telegram/setup-webhook',
            'POST /api/admin/telegram/delete-webhook',
            'GET  /api/incidents',
            'GET  /api/admin/incidents',
            'GET  /api/candidates',
            'GET  /api/admin/candidates',
            'GET  /api/admin/candidates/:id',
            'GET  /api/scheduler',
            'POST /api/scheduler/run',
            'GET  /api/analytics/feedback',
            'POST /api/analytics/feedback/refresh',
            'POST /api/test/event',
          ],
        });
      }

      throw new NotFoundError(`Endpoint not found: ${method} ${pathname}`);
    } catch (err) {
      const safeError = formatSafeErrorResponse(err, env.ENVIRONMENT);
      if (safeError.error.statusCode >= 500) {
        logger.error('request_error', `Unhandled request failure on ${method} ${pathname}`, {
          error: err,
        });
      } else {
        logger.warn('request_rejected', `Request ${method} ${pathname} rejected with status ${safeError.error.statusCode}: ${safeError.error.message}`);
      }
      return jsonResponse(safeError, safeError.error.statusCode);
    }
  },

  /**
   * Cloudflare Worker Cron Trigger Handler
   * Executes intelligent topic selection & shadow mode cycle without publishing to Telegram
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx?: ExecutionContext): Promise<void> {
    logger.info('scheduled_trigger_fired', `Cloudflare Worker Cron Trigger fired: ${event.cron}`, {
      context: { cron: event.cron, scheduledTime: event.scheduledTime },
    });

    const app = createAppContext(env);

    try {
      const result = await app.scheduler.executeScheduledCycle({
        cron: event.cron,
        scheduledTime: event.scheduledTime,
      });

      if (result.success) {
        logger.info('scheduled_pipeline_completed', `Intelligent scheduled shadow pipeline executed successfully: "${result.topic}"`, {
          context: { topic: result.topic, category: result.category, cycleId: result.cycleRecord.cycleId },
        });
      } else {
        logger.warn('scheduled_pipeline_partial_failure', `Intelligent scheduled cycle completed with status "${result.cycleRecord.status}": ${result.error}`);
      }
    } catch (err) {
      logger.error('scheduled_pipeline_failed', 'Scheduled shadow pipeline encountered critical exception', { error: err });
      await app.incidentManager.recordIncident({
        component: 'Scheduler:AutonomousCron',
        severity: 'high',
        error: err instanceof Error ? err.message : 'Unknown scheduler error',
        context: { cron: event.cron, scheduledTime: event.scheduledTime },
      });
    }
  },
};
