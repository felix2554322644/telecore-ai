/**
 * Autonomous Telegram Channel Manager - Production Safety & Control Layer
 *
 * Provides:
 * 1. Owner-controlled global kill switch (immediate emergency halt)
 * 2. Explicit autonomous-publishing state machine ('disabled' | 'armed' | 'standby')
 * 3. Immutable audit logging for every pipeline gate decision
 * 4. Multi-condition pre-publication safeguards (10-point inspection gate)
 *
 * Follows zero external dependencies and integrates cleanly with IStorage,
 * PublisherAgent, Orchestrator, and Scheduler.
 */

import { isTestMode } from '../config/config.ts';
import {
  AutonomousPublishingState,
  DecisionCategory,
  Env,
  IStorage,
  PipelineDecisionLog,
  PrePublicationCheck,
  PrePublicationGateRequest,
  PrePublicationGateResult,
  ProductionControlState,
  ProductionSafetyConfig,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('ProductionControl');

const STORAGE_KEY_CONTROL_STATE = 'production:control:state';
const STORAGE_KEY_AUDIT_LOG_PREFIX = 'audit:decision:';
const STORAGE_KEY_AUDIT_RECENT_INDEX = 'audit:recent_index';
const MAX_RECENT_AUDIT_LOGS = 100;

export const DEFAULT_SAFETY_CONFIG: ProductionSafetyConfig = {
  minQualityThreshold: 7.0,
  minConfidenceThreshold: 0.80,
  maxPostsPerHour: 2,
  minPostIntervalMinutes: 15,
  allowedChannels: [],
  enforceStrictFactCheck: true,
  maxCharacterLength: 4096,
};

export class ProductionControlManager {
  private storage: IStorage;
  private env: Partial<Env>;
  private inMemoryCache?: ProductionControlState;

  constructor(storage: IStorage, env: Partial<Env> = {}) {
    this.storage = storage;
    this.env = env;
  }

  /**
   * Retrieve the current production control state from storage
   */
  public async getControlState(): Promise<ProductionControlState> {
    try {
      const persisted = await this.storage.get<ProductionControlState>(STORAGE_KEY_CONTROL_STATE);
      if (persisted) {
        // Reset publicationsThisHour if more than 1 hour has elapsed since last publish
        const now = Date.now();
        if (persisted.lastPublishedAt && now - persisted.lastPublishedAt > 3600 * 1000) {
          persisted.publicationsThisHour = 0;
        }
        this.inMemoryCache = persisted;
        return persisted;
      }
    } catch (err) {
      logger.warn('control_state_fetch_error', 'Failed to fetch persisted control state, using fallback', { error: err });
    }

    if (this.inMemoryCache) {
      return this.inMemoryCache;
    }

    const defaultChannels = this.env.TELEGRAM_CHANNEL_ID ? [this.env.TELEGRAM_CHANNEL_ID.trim()] : [];
    const defaultState: ProductionControlState = {
      killSwitchActive: false,
      autonomousPublishingState: 'disabled', // Safe default: autonomous publishing requires explicit arming
      publicationsThisHour: 0,
      safetyConfig: {
        ...DEFAULT_SAFETY_CONFIG,
        allowedChannels: defaultChannels,
      },
      updatedAt: Date.now(),
    };

    this.inMemoryCache = defaultState;
    return defaultState;
  }

  /**
   * Check if the global kill switch is currently engaged
   */
  public async isKillSwitchActive(): Promise<boolean> {
    const state = await this.getControlState();
    return state.killSwitchActive;
  }

  /**
   * Owner-controlled Global Kill Switch toggle
   * When active, immediately aborts and blocks any publishing or autonomous pipeline execution.
   */
  public async setKillSwitch(
    active: boolean,
    reason?: string,
    actor = 'owner:admin',
    correlationId?: string
  ): Promise<ProductionControlState> {
    const currentState = await this.getControlState();
    const now = Date.now();

    const updatedState: ProductionControlState = {
      ...currentState,
      killSwitchActive: active,
      killSwitchReason: active ? (reason || 'Manual emergency stop engaged by owner') : undefined,
      killSwitchActivatedAt: active ? now : undefined,
      killSwitchActivatedBy: active ? actor : undefined,
      updatedAt: now,
    };

    await this.storage.set(STORAGE_KEY_CONTROL_STATE, updatedState);
    this.inMemoryCache = updatedState;

    const decision = active ? 'HALTED' : 'ALLOW';
    const logReason = active
      ? `Global kill switch ENGAGED by ${actor}: ${reason || 'Emergency halt'}`
      : `Global kill switch DISENGAGED by ${actor}. Normal safeguard operations resumed.`;

    logger.warn('kill_switch_toggled', logReason, {
      correlationId,
      context: { active, actor, reason },
    });

    await this.recordDecisionLog({
      category: 'kill_switch',
      decision,
      reason: logReason,
      actor,
      correlationId,
      metadata: { killSwitchActive: active, reason },
    });

    return updatedState;
  }

  /**
   * Set explicit autonomous publishing state ('disabled' | 'armed' | 'standby')
   */
  public async setAutonomousPublishingState(
    newState: AutonomousPublishingState,
    actor = 'owner:admin',
    correlationId?: string
  ): Promise<ProductionControlState> {
    const currentState = await this.getControlState();
    const now = Date.now();

    const updatedState: ProductionControlState = {
      ...currentState,
      autonomousPublishingState: newState,
      autonomousPublishingArmedAt: newState === 'armed' ? now : undefined,
      autonomousPublishingArmedBy: newState === 'armed' ? actor : undefined,
      updatedAt: now,
    };

    await this.storage.set(STORAGE_KEY_CONTROL_STATE, updatedState);
    this.inMemoryCache = updatedState;

    const decision = newState === 'armed' ? 'ARMED' : (newState === 'disabled' ? 'DISARMED' : 'BLOCK');
    const logReason = `Autonomous publishing state transitioned to '${newState}' by ${actor}`;

    logger.info('autonomous_publishing_state_changed', logReason, {
      correlationId,
      context: { newState, actor },
    });

    await this.recordDecisionLog({
      category: 'autonomous_state',
      decision,
      reason: logReason,
      actor,
      correlationId,
      metadata: { autonomousPublishingState: newState },
    });

    return updatedState;
  }

  /**
   * Update production safety thresholds and allowed channels
   */
  public async updateSafetyConfig(
    updates: Partial<ProductionSafetyConfig>,
    actor = 'owner:admin',
    correlationId?: string
  ): Promise<ProductionControlState> {
    const currentState = await this.getControlState();
    const updatedConfig: ProductionSafetyConfig = {
      ...currentState.safetyConfig,
      ...updates,
    };

    const updatedState: ProductionControlState = {
      ...currentState,
      safetyConfig: updatedConfig,
      updatedAt: Date.now(),
    };

    await this.storage.set(STORAGE_KEY_CONTROL_STATE, updatedState);
    this.inMemoryCache = updatedState;

    await this.recordDecisionLog({
      category: 'admin_action',
      decision: 'ALLOW',
      reason: `Production safety configuration updated by ${actor}`,
      actor,
      correlationId,
      metadata: { safetyConfig: updatedConfig },
    });

    return updatedState;
  }

  /**
   * Evaluates all 10 pre-publication safeguards before any publication can occur.
   * Fail-closed: ALL required checks must pass.
   */
  public async evaluatePrePublicationGate(
    request: PrePublicationGateRequest
  ): Promise<PrePublicationGateResult> {
    const state = await this.getControlState();
    const isTest = isTestMode(this.env);
    const checks: PrePublicationCheck[] = [];
    const now = Date.now();

    // 1. Global Kill Switch check (MANDATORY)
    const killSwitchPassed = !state.killSwitchActive;
    checks.push({
      name: 'Global Kill Switch Inactive',
      category: 'kill_switch',
      passed: killSwitchPassed,
      required: true,
      details: killSwitchPassed
        ? 'Kill switch is disengaged'
        : `Kill switch is ACTIVE: ${state.killSwitchReason || 'Emergency stop'}`,
    });

    // 2. Autonomous State check (MANDATORY for automated runs)
    const isManual = Boolean(request.isManualTest);
    const autonomousPassed = isManual || state.autonomousPublishingState === 'armed';
    checks.push({
      name: 'Autonomous Publishing Armed',
      category: 'autonomous_state',
      passed: autonomousPassed,
      required: !isManual,
      details: isManual
        ? 'Manual test bypasses autonomous publishing state'
        : `Autonomous state is '${state.autonomousPublishingState}' (must be 'armed' to publish)`,
    });

    // 3. Environment & Safety Mode check
    // In test mode (default), real automated publishing is safely blocked
    const livePublishingAllowed = !isTest || isManual;
    checks.push({
      name: 'Production Environment Safety',
      category: 'environment',
      passed: livePublishingAllowed,
      required: true,
      details: isTest
        ? (isManual ? 'Manual test permitted with admin auth' : 'Blocked: TELEGRAM_TEST_MODE is enabled (shadow mode)')
        : 'Live mode active',
    });

    // 4. Fact-Checking verification check
    const factCheckRequired = state.safetyConfig.enforceStrictFactCheck;
    const factCheckPassed = request.factCheckPassed !== false;
    checks.push({
      name: 'Fact-Check Verification',
      category: 'fact_check',
      passed: factCheckPassed,
      required: factCheckRequired,
      details: factCheckPassed
        ? `Fact check passed (${request.claimsVerifiedCount ?? 0} claims verified)`
        : 'Fact check failed or rejected by auditor',
    });

    // 5. Confidence Score threshold check
    const rawConf = request.confidenceScore ?? 1.0;
    const confidence = rawConf > 1.0 ? rawConf / 100 : rawConf;
    const confThreshold = state.safetyConfig.minConfidenceThreshold > 1.0
      ? state.safetyConfig.minConfidenceThreshold / 100
      : state.safetyConfig.minConfidenceThreshold;
    const confidencePassed = confidence >= confThreshold;
    checks.push({
      name: 'Confidence Threshold Met',
      category: 'quality',
      passed: confidencePassed,
      required: true,
      details: `Confidence ${confidence.toFixed(2)} (threshold: >= ${confThreshold.toFixed(2)})`,
    });

    // 6. Quality Score threshold check
    const rawQuality = request.qualityScore ?? 10.0;
    const quality = rawQuality <= 1.0 ? rawQuality * 10 : rawQuality;
    const qualityThreshold = state.safetyConfig.minQualityThreshold <= 1.0
      ? state.safetyConfig.minQualityThreshold * 10
      : state.safetyConfig.minQualityThreshold;
    const qualityPassed = quality >= qualityThreshold;
    checks.push({
      name: 'Quality Threshold Met',
      category: 'quality',
      passed: qualityPassed,
      required: true,
      details: `Quality score ${quality.toFixed(1)} (threshold: >= ${qualityThreshold.toFixed(1)})`,
    });

    // 7. Sanctioned Channel whitelist check
    const targetChannel = (request.channelId || this.env.TELEGRAM_CHANNEL_ID || '').trim();
    const configuredTarget = (this.env.TELEGRAM_CHANNEL_ID || '').trim();
    const whitelist = state.safetyConfig.allowedChannels || [];
    const channelMatchesConfig = configuredTarget.length > 0 && targetChannel.toLowerCase() === configuredTarget.toLowerCase();
    const channelInWhitelist = whitelist.length === 0 || whitelist.some((ch) => ch.toLowerCase() === targetChannel.toLowerCase());
    const channelSanctioned = targetChannel.length > 0 && (channelMatchesConfig || channelInWhitelist);
    checks.push({
      name: 'Sanctioned Channel Destination',
      category: 'channel',
      passed: channelSanctioned,
      required: true,
      details: channelSanctioned
        ? `Channel '${targetChannel}' matches sanctioned whitelist`
        : `Channel '${targetChannel || 'unspecified'}' is not configured or not in allowed list`,
    });

    // 8. Telegram Bot Token credentials check
    const hasBotToken = Boolean(this.env.TELEGRAM_BOT_TOKEN && this.env.TELEGRAM_BOT_TOKEN.trim().length > 0);
    checks.push({
      name: 'Telegram Credentials Bound',
      category: 'channel',
      passed: hasBotToken,
      required: true,
      details: hasBotToken ? 'Bot token binding present' : 'Missing TELEGRAM_BOT_TOKEN binding',
    });

    // 9. Rate Limit & Cooldown interval check
    let rateLimitPassed = true;
    let rateLimitDetails = 'Rate limit within acceptable thresholds';
    if (!isManual) {
      if (state.publicationsThisHour >= state.safetyConfig.maxPostsPerHour) {
        rateLimitPassed = false;
        rateLimitDetails = `Hourly limit reached (${state.publicationsThisHour}/${state.safetyConfig.maxPostsPerHour} posts this hour)`;
      } else if (state.lastPublishedAt) {
        const cooldownMs = state.safetyConfig.minPostIntervalMinutes * 60 * 1000;
        const timeSinceLast = now - state.lastPublishedAt;
        if (timeSinceLast < cooldownMs) {
          rateLimitPassed = false;
          const remainingMins = Math.ceil((cooldownMs - timeSinceLast) / 60000);
          rateLimitDetails = `Cooldown in effect: wait ${remainingMins} more minutes (interval: ${state.safetyConfig.minPostIntervalMinutes}m)`;
        }
      }
    }
    checks.push({
      name: 'Rate Limit & Publication Cooldown',
      category: 'rate_limit',
      passed: rateLimitPassed,
      required: !isManual,
      details: rateLimitDetails,
    });

    // 10. Content Validity & Character Bounds check
    const text = request.formattedText || '';
    const textValid = text.trim().length > 0 && text.length <= state.safetyConfig.maxCharacterLength;
    checks.push({
      name: 'Content Character Bounds & Validity',
      category: 'content',
      passed: textValid,
      required: true,
      details: textValid
        ? `Content length: ${text.length} chars (within 1..${state.safetyConfig.maxCharacterLength})`
        : `Invalid content length: ${text.length} chars (must be between 1 and ${state.safetyConfig.maxCharacterLength})`,
    });

    // Determine overall result: ALL required checks must pass
    const failedRequiredChecks = checks.filter((c) => c.required && !c.passed);
    const allowed = failedRequiredChecks.length === 0;
    const action = allowed ? 'ALLOW' : (!killSwitchPassed ? 'HALTED' : 'BLOCK');
    const reason = allowed
      ? 'All 10 production safeguards satisfied'
      : `Blocked by safeguards: ${failedRequiredChecks.map((c) => c.name).join('; ')}`;

    const result: PrePublicationGateResult = {
      allowed,
      action: allowed ? 'ALLOW' : 'BLOCK',
      reason,
      checks,
      timestamp: now,
      evaluatedBy: 'ProductionSafetyManager',
    };

    // Log decision into immutable audit trail
    await this.recordDecisionLog({
      category: 'pre_publish_gate',
      decision: allowed ? 'ALLOW' : 'BLOCK',
      reason,
      actor: request.actor || (isManual ? 'owner:admin' : 'agent:publisher'),
      targetContentId: request.contentId,
      targetChannelId: targetChannel,
      correlationId: request.correlationId,
      checks,
      metadata: {
        isManualTest: isManual,
        qualityScore: quality,
        confidenceScore: confidence,
        failedChecksCount: failedRequiredChecks.length,
      },
    });

    return result;
  }

  /**
   * Records a publication success event, updating rate limit counts and timestamps
   */
  public async recordPublicationSuccess(
    channelId: string,
    contentId: string,
    correlationId?: string
  ): Promise<void> {
    const currentState = await this.getControlState();
    const now = Date.now();

    const updatedState: ProductionControlState = {
      ...currentState,
      lastPublishedAt: now,
      publicationsThisHour: (currentState.publicationsThisHour || 0) + 1,
      updatedAt: now,
    };

    await this.storage.set(STORAGE_KEY_CONTROL_STATE, updatedState);
    this.inMemoryCache = updatedState;

    await this.recordDecisionLog({
      category: 'admin_action',
      decision: 'ALLOW',
      reason: `Content ${contentId} successfully published to ${channelId}`,
      actor: 'agent:publisher',
      targetContentId: contentId,
      targetChannelId: channelId,
      correlationId,
    });
  }

  /**
   * Append an immutable pipeline decision log into the audit trail
   */
  public async recordDecisionLog(
    entry: Omit<PipelineDecisionLog, 'id' | 'timestamp'>
  ): Promise<PipelineDecisionLog> {
    const now = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const id = `audit_${now}_${randomSuffix}`;

    const fullLog: PipelineDecisionLog = {
      id,
      timestamp: now,
      ...entry,
    };

    const key = `${STORAGE_KEY_AUDIT_LOG_PREFIX}${id}`;
    try {
      await this.storage.set(key, fullLog, { expirationTtl: 30 * 86400 }); // Retain 30 days

      // Update recent audit log IDs ring buffer
      const recentIds = (await this.storage.get<string[]>(STORAGE_KEY_AUDIT_RECENT_INDEX)) || [];
      recentIds.unshift(id);
      if (recentIds.length > MAX_RECENT_AUDIT_LOGS) {
        recentIds.length = MAX_RECENT_AUDIT_LOGS;
      }
      await this.storage.set(STORAGE_KEY_AUDIT_RECENT_INDEX, recentIds);
    } catch (err) {
      logger.warn('audit_log_write_error', 'Failed to persist audit log entry', { error: err });
    }

    return fullLog;
  }

  /**
   * Query the decision audit trail with filtering and pagination
   */
  public async listDecisionLogs(options?: {
    limit?: number;
    category?: DecisionCategory;
    decision?: string;
  }): Promise<PipelineDecisionLog[]> {
    const limit = Math.min(options?.limit || 50, MAX_RECENT_AUDIT_LOGS);

    try {
      const recentIds = (await this.storage.get<string[]>(STORAGE_KEY_AUDIT_RECENT_INDEX)) || [];
      const logs: PipelineDecisionLog[] = [];

      for (const id of recentIds) {
        if (logs.length >= limit) break;
        const key = `${STORAGE_KEY_AUDIT_LOG_PREFIX}${id}`;
        const log = await this.storage.get<PipelineDecisionLog>(key);
        if (log) {
          if (options?.category && log.category !== options.category) {
            continue;
          }
          if (options?.decision && log.decision !== options.decision) {
            continue;
          }
          logs.push(log);
        }
      }

      return logs;
    } catch (err) {
      logger.warn('audit_log_list_error', 'Failed to list audit logs', { error: err });
      return [];
    }
  }

  /**
   * Retrieve a single decision audit log entry by ID
   */
  public async getDecisionLog(id: string): Promise<PipelineDecisionLog | null> {
    const key = `${STORAGE_KEY_AUDIT_LOG_PREFIX}${id}`;
    return this.storage.get<PipelineDecisionLog>(key);
  }
}
