import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublisherAgent } from '../src/agents/publisher.ts';
import worker, { createAppContext } from '../src/index.ts';
import { ProductionControlManager } from '../src/safety/productionControl.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { ITelegramClient } from '../src/telegram/client.ts';
import { Env, ProductionControlState } from '../src/types/index.ts';

describe('Phase 12: Production Safety & Control Layer', () => {
  const baseProductionEnv: Env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_WEBHOOK_SECRET: 'super_webhook_sec_123',
    GEMINI_API_KEY: 'mock_gemini_key',
    TELEGRAM_CHANNEL_ID: '@test_channel',
    ADMIN_SECRET: 'super_admin_secret_777',
    ENVIRONMENT: 'production',
    APP_URL: 'https://telecore-ai.workers.dev',
    TELEGRAM_TEST_MODE: 'true',
  };

  let storage: InMemoryStorageAdapter;
  let controlManager: ProductionControlManager;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    controlManager = new ProductionControlManager(storage, baseProductionEnv);
  });

  describe('1. Global Kill Switch State & Enforcement', () => {
    it('initializes with kill switch disengaged by default', async () => {
      const state = await controlManager.getControlState();
      expect(state.killSwitchActive).toBe(false);
      expect(await controlManager.isKillSwitchActive()).toBe(false);
    });

    it('engages global kill switch and persists reason, actor, and timestamp', async () => {
      const updated = await controlManager.setKillSwitch(
        true,
        'Suspicious prompt injection detected',
        'owner:admin'
      );

      expect(updated.killSwitchActive).toBe(true);
      expect(updated.killSwitchReason).toBe('Suspicious prompt injection detected');
      expect(updated.killSwitchActivatedBy).toBe('owner:admin');
      expect(updated.killSwitchActivatedAt).toBeGreaterThan(0);

      // Verify persistence in storage
      const fetchedState = await controlManager.getControlState();
      expect(fetchedState.killSwitchActive).toBe(true);
      expect(fetchedState.killSwitchReason).toBe('Suspicious prompt injection detected');
    });

    it('disengages global kill switch when deactivated by owner', async () => {
      await controlManager.setKillSwitch(true, 'Emergency testing', 'owner:admin');
      expect(await controlManager.isKillSwitchActive()).toBe(true);

      const disengaged = await controlManager.setKillSwitch(
        false,
        'Emergency resolved and verified',
        'owner:admin'
      );
      expect(disengaged.killSwitchActive).toBe(false);
      expect(await controlManager.isKillSwitchActive()).toBe(false);
    });

    it('blocks pre-publication gate immediately when kill switch is engaged', async () => {
      await controlManager.setKillSwitch(true, 'Maintenance active');

      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_kill_01',
        channelId: '@test_channel',
        formattedText: 'Valid tech post about AI agents.',
        qualityScore: 9.5,
        confidenceScore: 0.95,
        factCheckPassed: true,
        claimsVerifiedCount: 4,
      });

      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Global Kill Switch');
      const killCheck = gate.checks.find((c) => c.category === 'kill_switch');
      expect(killCheck?.passed).toBe(false);
    });
  });

  describe('2. Autonomous Publishing State Machine', () => {
    it('defaults autonomous publishing state to disabled', async () => {
      const state = await controlManager.getControlState();
      expect(state.autonomousPublishingState).toBe('disabled');
    });

    it('transitions between disabled, armed, and standby states', async () => {
      const armed = await controlManager.setAutonomousPublishingState('armed', 'owner:admin');
      expect(armed.autonomousPublishingState).toBe('armed');

      const standby = await controlManager.setAutonomousPublishingState('standby', 'owner:admin');
      expect(standby.autonomousPublishingState).toBe('standby');

      const disabled = await controlManager.setAutonomousPublishingState('disabled', 'owner:admin');
      expect(disabled.autonomousPublishingState).toBe('disabled');
    });

    it('blocks automated publication when autonomous state is disabled or standby', async () => {
      // Disabled state
      await controlManager.setAutonomousPublishingState('disabled');
      let gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_state_01',
        channelId: '@test_channel',
        formattedText: 'Autonomous article draft',
        qualityScore: 9.0,
        confidenceScore: 0.90,
        factCheckPassed: true,
      });
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Autonomous Publishing Armed');

      // Standby state
      await controlManager.setAutonomousPublishingState('standby');
      gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_state_02',
        channelId: '@test_channel',
        formattedText: 'Autonomous article draft 2',
        qualityScore: 9.0,
        confidenceScore: 0.90,
        factCheckPassed: true,
      });
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Autonomous Publishing Armed');
    });

    it('allows manual test publication even when autonomous state is disabled', async () => {
      await controlManager.setAutonomousPublishingState('disabled');
      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_manual_01',
        channelId: '@test_channel',
        formattedText: 'Manual test draft by owner',
        isManualTest: true,
        qualityScore: 8.5,
        confidenceScore: 0.88,
        factCheckPassed: true,
      });

      // Manual test check should pass
      const testModeCheck = gate.checks.find((c) => c.category === 'environment');
      expect(testModeCheck?.passed).toBe(true);
    });
  });

  describe('3. Safeguard Gates & Blocked Publishing Conditions (10-point check)', () => {
    it('blocks publishing when quality score is below minQualityThreshold', async () => {
      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_low_quality',
        channelId: '@test_channel',
        formattedText: 'Low quality snippet',
        qualityScore: 5.5, // Below default 7.0 threshold
        confidenceScore: 0.90,
        factCheckPassed: true,
        isManualTest: true,
      });

      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Quality Threshold Met');
      const qualityCheck = gate.checks.find((c) => c.name === 'Quality Threshold Met');
      expect(qualityCheck?.passed).toBe(false);
    });

    it('blocks publishing when confidence score is below minConfidenceThreshold', async () => {
      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_low_confidence',
        channelId: '@test_channel',
        formattedText: 'Uncertain post text',
        qualityScore: 8.5,
        confidenceScore: 0.60, // Below default 0.80 threshold
        factCheckPassed: true,
        isManualTest: true,
      });

      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Confidence Threshold Met');
      const confCheck = gate.checks.find((c) => c.name === 'Confidence Threshold Met');
      expect(confCheck?.passed).toBe(false);
    });

    it('blocks publishing when strict fact check fails', async () => {
      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_fact_failed',
        channelId: '@test_channel',
        formattedText: 'Unverified post text',
        qualityScore: 8.5,
        confidenceScore: 0.85,
        factCheckPassed: false,
        isManualTest: true,
      });

      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Fact-Check Verification');
      const factCheck = gate.checks.find((c) => c.category === 'fact_check');
      expect(factCheck?.passed).toBe(false);
    });

    it('blocks publishing when target channel is not in allowedChannels whitelist', async () => {
      await controlManager.updateSafetyConfig({
        allowedChannels: ['@techpluseai', '@official_channel'],
      });

      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_unauthorized_channel',
        channelId: '@malicious_channel',
        formattedText: 'Article for unauthorized channel',
        qualityScore: 8.5,
        confidenceScore: 0.85,
        factCheckPassed: true,
        isManualTest: true,
      });

      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Sanctioned Channel Destination');
      const channelCheck = gate.checks.find((c) => c.name === 'Sanctioned Channel Destination');
      expect(channelCheck?.passed).toBe(false);
    });

    it('blocks publishing when hourly rate limit is exceeded', async () => {
      await controlManager.updateSafetyConfig({ maxPostsPerHour: 2 });

      // Record 2 publications
      await controlManager.recordPublicationSuccess('@test_channel', 'post_1');
      await controlManager.recordPublicationSuccess('@test_channel', 'post_2');

      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_rate_exceeded',
        channelId: '@test_channel',
        formattedText: 'Third article in an hour',
        qualityScore: 8.5,
        confidenceScore: 0.85,
        factCheckPassed: true,
        isManualTest: false,
      });

      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Rate Limit & Publication Cooldown');
      const rateCheck = gate.checks.find((c) => c.category === 'rate_limit');
      expect(rateCheck?.passed).toBe(false);
      expect(rateCheck?.details).toContain('Hourly limit reached');
    });

    it('blocks publishing when minimum post interval has not elapsed', async () => {
      await controlManager.updateSafetyConfig({ minPostIntervalMinutes: 10 });

      // Record a recent publication just now
      await controlManager.recordPublicationSuccess('@test_channel', 'post_recent');

      const gate = await controlManager.evaluatePrePublicationGate({
        contentId: 'draft_interval_too_fast',
        channelId: '@test_channel',
        formattedText: 'Another article too soon',
        qualityScore: 8.5,
        confidenceScore: 0.85,
        factCheckPassed: true,
        isManualTest: false,
      });

      expect(gate.allowed).toBe(false);
      expect(gate.reason).toContain('Rate Limit & Publication Cooldown');
      const intervalCheck = gate.checks.find((c) => c.category === 'rate_limit');
      expect(intervalCheck?.passed).toBe(false);
      expect(intervalCheck?.details).toContain('Cooldown in effect');
    });

    it('passes all 10 safeguards when armed in production with high quality content', async () => {
      // Configure production env with TELEGRAM_TEST_MODE=false
      const prodEnv: Env = {
        ...baseProductionEnv,
        TELEGRAM_TEST_MODE: 'false',
        ENVIRONMENT: 'production',
      };
      const prodControl = new ProductionControlManager(storage, prodEnv);
      await prodControl.setAutonomousPublishingState('armed');

      const gate = await prodControl.evaluatePrePublicationGate({
        contentId: 'draft_pristine_01',
        channelId: '@test_channel',
        formattedText: 'Pristine autonomous technical analysis on cloud architectures.',
        qualityScore: 9.2,
        confidenceScore: 0.94,
        factCheckPassed: true,
        claimsVerifiedCount: 5,
      });

      expect(gate.allowed).toBe(true);
      expect(gate.checks.every((c) => !c.required || c.passed)).toBe(true);
    });
  });

  describe('4. Immutable Audit Logging', () => {
    it('records and retrieves decision logs with category and decision metadata', async () => {
      const logEntry = await controlManager.recordDecisionLog({
        category: 'pre_publish_gate',
        decision: 'ALLOW',
        reason: 'All pre-publication safeguards verified',
        targetContentId: 'draft_audit_01',
        targetChannelId: '@test_channel',
        actor: 'system:gate_evaluator',
        correlationId: 'corr_test_01',
        metadata: { qualityScore: 9.0, confidenceScore: 0.92 },
      });

      expect(logEntry.id).toMatch(/^audit_/);
      expect(logEntry.timestamp).toBeGreaterThan(0);
      expect(logEntry.category).toBe('pre_publish_gate');
      expect(logEntry.decision).toBe('ALLOW');

      // Retrieve single decision log
      const retrieved = await controlManager.getDecisionLog(logEntry.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.targetContentId).toBe('draft_audit_01');
      expect((retrieved?.metadata as any)?.qualityScore).toBe(9.0);
    });

    it('filters decision logs by category and decision', async () => {
      await controlManager.recordDecisionLog({
        category: 'kill_switch',
        decision: 'HALTED',
        reason: 'Manual kill switch activation',
        actor: 'owner:admin',
      });
      await controlManager.recordDecisionLog({
        category: 'pre_publish_gate',
        decision: 'BLOCK',
        reason: 'Low quality score',
        actor: 'system',
      });
      await controlManager.recordDecisionLog({
        category: 'pre_publish_gate',
        decision: 'ALLOW',
        reason: 'Approved',
        actor: 'system',
      });

      const killLogs = await controlManager.listDecisionLogs({ category: 'kill_switch' });
      expect(killLogs.length).toBe(1);
      expect(killLogs[0].category).toBe('kill_switch');

      const blockedLogs = await controlManager.listDecisionLogs({ decision: 'BLOCK' });
      expect(blockedLogs.length).toBe(1);
      expect(blockedLogs[0].decision).toBe('BLOCK');
    });
  });

  describe('5. PublisherAgent with Production Control Integration', () => {
    it('PublisherAgent queries pre-publication gate and blocks unapproved publish requests', async () => {
      const mockSendMessage = vi.fn();
      const mockClient: ITelegramClient = {
        isConfigured: () => true,
        getMe: vi.fn(),
        sendMessage: mockSendMessage,
        getChat: vi.fn(),
        getChatMember: vi.fn(),
        getChatAdministrators: vi.fn(),
        setWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
        getWebhookInfo: vi.fn(),
        verifyChannelAccess: vi.fn(),
      };

      const publisher = new PublisherAgent(mockClient, baseProductionEnv, controlManager);

      const result = await publisher.execute({
        contentId: 'pub_test_01',
        channelId: '@test_channel',
        formattedText: 'Draft to publish',
        qualityScore: 8.5,
        confidenceScore: 0.88,
        factCheckPassed: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Publication blocked by production safeguards');
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('PublisherAgent dispatches real message and records success when gate allows', async () => {
      const prodEnv: Env = {
        ...baseProductionEnv,
        TELEGRAM_TEST_MODE: 'false',
        ENVIRONMENT: 'production',
      };
      const prodControl = new ProductionControlManager(storage, prodEnv);
      await prodControl.setAutonomousPublishingState('armed');

      const mockSendMessage = vi.fn().mockResolvedValue({
        message_id: 54321,
        chat: { id: -10012345, type: 'channel' },
        date: Math.floor(Date.now() / 1000),
      });
      const mockClient: ITelegramClient = {
        isConfigured: () => true,
        getMe: vi.fn(),
        sendMessage: mockSendMessage,
        getChat: vi.fn(),
        getChatMember: vi.fn(),
        getChatAdministrators: vi.fn(),
        setWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
        getWebhookInfo: vi.fn(),
        verifyChannelAccess: vi.fn(),
      };

      const publisher = new PublisherAgent(mockClient, prodEnv, prodControl);

      const result = await publisher.execute({
        contentId: 'pub_success_01',
        channelId: '@test_channel',
        formattedText: 'Approved tech news post.',
        qualityScore: 9.1,
        confidenceScore: 0.95,
        factCheckPassed: true,
        claimsVerifiedCount: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data?.messageId).toBe(54321);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      // Verify rate limit counter was updated
      const state = await prodControl.getControlState();
      expect(state.publicationsThisHour).toBe(1);
    });
  });

  describe('6. REST API Endpoints for Control & Audit', () => {
    it('GET /api/control/status returns production control state and safeguards', async () => {
      const request = new Request('https://telecore.internal/api/control/status', {
        method: 'GET',
      });

      const response = await worker.fetch(request, baseProductionEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.state).toBeDefined();
      expect(data.state.killSwitchActive).toBe(false);
      expect(data.state.autonomousPublishingState).toBe('disabled');
      expect(data.state.safetyConfig.minQualityThreshold).toBe(7.0);
    });

    it('POST /api/admin/control/kill-switch toggles kill switch when authorized', async () => {
      // 1. Engage kill switch
      const reqEngage = new Request('https://telecore.internal/api/admin/control/kill-switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super_admin_secret_777',
        },
        body: JSON.stringify({
          active: true,
          reason: 'Emergency operator stop',
        }),
      });

      const resEngage = await worker.fetch(reqEngage, baseProductionEnv);
      expect(resEngage.status).toBe(200);
      const dataEngage = await resEngage.json();
      expect(dataEngage.ok).toBe(true);
      expect(dataEngage.state.killSwitchActive).toBe(true);
      expect(dataEngage.state.killSwitchReason).toBe('Emergency operator stop');

      // 2. Disengage kill switch
      const reqDisengage = new Request('https://telecore.internal/api/admin/control/kill-switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super_admin_secret_777',
        },
        body: JSON.stringify({
          active: false,
          reason: 'Clear to resume',
        }),
      });

      const resDisengage = await worker.fetch(reqDisengage, baseProductionEnv);
      expect(resDisengage.status).toBe(200);
      const dataDisengage = await resDisengage.json();
      expect(dataDisengage.ok).toBe(true);
      expect(dataDisengage.state.killSwitchActive).toBe(false);
    });

    it('POST /api/admin/control/autonomous-publishing updates state machine', async () => {
      const request = new Request('https://telecore.internal/api/admin/control/autonomous-publishing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super_admin_secret_777',
        },
        body: JSON.stringify({ state: 'armed' }),
      });

      const response = await worker.fetch(request, baseProductionEnv);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.state.autonomousPublishingState).toBe('armed');
    });

    it('POST /api/admin/control/safety-config modifies safeguard thresholds', async () => {
      const request = new Request('https://telecore.internal/api/admin/control/safety-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super_admin_secret_777',
        },
        body: JSON.stringify({
          minQualityThreshold: 8.2,
          minConfidenceThreshold: 0.90,
          maxPostsPerHour: 4,
        }),
      });

      const response = await worker.fetch(request, baseProductionEnv);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.state.safetyConfig.minQualityThreshold).toBe(8.2);
      expect(data.state.safetyConfig.minConfidenceThreshold).toBe(0.90);
      expect(data.state.safetyConfig.maxPostsPerHour).toBe(4);
    });

    it('GET /api/audit-logs lists immutable pipeline decision logs', async () => {
      const request = new Request('https://telecore.internal/api/audit-logs?limit=10', {
        method: 'GET',
      });

      const response = await worker.fetch(request, baseProductionEnv);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.logs)).toBe(true);
    });

    it('blocks POST /api/admin/telegram/test-publish if kill switch is active', async () => {
      const sharedStorage = new InMemoryStorageAdapter();
      const customEnv = {
        ...baseProductionEnv,
        __STORAGE__: sharedStorage,
      };

      // 1. Engage kill switch via admin control route
      const toggleReq = new Request('https://telecore.internal/api/admin/control/kill-switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super_admin_secret_777',
        },
        body: JSON.stringify({ active: true, reason: 'Emergency active' }),
      });
      const toggleRes = await worker.fetch(toggleReq, customEnv);
      expect(toggleRes.status).toBe(200);

      // 2. Attempt test-publish while kill switch is active
      const request = new Request('https://telecore.internal/api/admin/telegram/test-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super_admin_secret_777',
        },
        body: JSON.stringify({ message: 'Should be blocked by kill switch' }),
      });

      const pubResponse = await worker.fetch(request, customEnv);
      expect(pubResponse.status).toBe(403);
      const pubData = await pubResponse.json();
      expect(pubData.error).toContain('Global kill switch is ACTIVE');
      expect(pubData.killSwitchActive).toBe(true);
    });
  });
});
