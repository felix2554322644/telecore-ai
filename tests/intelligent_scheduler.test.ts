import { describe, expect, it, vi } from 'vitest';
import { IGeminiService } from '../src/ai/gemini.ts';
import { CandidateManager } from '../src/health/candidates.ts';
import { IncidentManager } from '../src/health/incidents.ts';
import worker from '../src/index.ts';
import { Orchestrator } from '../src/orchestrator/orchestrator.ts';
import { DEFAULT_TOPIC_CLUSTERS, IntelligentScheduler } from '../src/scheduler/intelligentScheduler.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { ITelegramClient } from '../src/telegram/client.ts';
import { Env, ScheduledEvent, TopicCluster } from '../src/types/index.ts';

describe('Phase 10: Intelligent Scheduling & Topic Rotation', () => {
  const mockEnv: Env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_WEBHOOK_SECRET: 'test_webhook_sec_123',
    GEMINI_API_KEY: 'test_gemini_key',
    TELEGRAM_CHANNEL_ID: '@telecore_channel',
    ADMIN_SECRET: 'sched_admin_secret_456',
    ENVIRONMENT: 'production',
    APP_URL: 'https://telecore-ai.workers.dev',
    TELEGRAM_TEST_MODE: 'true',
  };

  const createMockTelegramClient = (): ITelegramClient => ({
    isConfigured: () => true,
    sendMessage: vi.fn().mockResolvedValue({ message_id: 999, ok: true }),
    getMe: vi.fn().mockResolvedValue({ ok: true, result: { id: 123456, is_bot: true, first_name: 'TeleCore AI Bot', username: 'telecore_bot' } }),
    getChat: vi.fn().mockResolvedValue({ ok: true, result: { id: -1001234567890, title: 'Tech Pulse AI', type: 'channel' } }),
    getChatMember: vi.fn().mockResolvedValue({ ok: true, result: { status: 'administrator' } }),
    getChatAdministrators: vi.fn().mockResolvedValue({ ok: true, result: [] }),
    setWebhook: vi.fn().mockResolvedValue({ ok: true }),
    deleteWebhook: vi.fn().mockResolvedValue({ ok: true }),
    getWebhookInfo: vi.fn().mockResolvedValue({ ok: true, result: { url: 'https://telecore-ai.workers.dev/webhooks/telegram', has_custom_certificate: false, pending_update_count: 0 } }),
    verifyChannelAccess: vi.fn().mockResolvedValue({ accessible: true, canPostMessages: true }),
  });

  describe('Topic Rotation & Avoidance Engine', () => {
    it('rotates across different topic clusters over consecutive cycles', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);
      const incidentMgr = new IncidentManager(storage);
      const tgClient = createMockTelegramClient();
      const orchestrator = new Orchestrator(tgClient, incidentMgr, mockEnv, candidateMgr);

      const scheduler = new IntelligentScheduler(
        storage,
        orchestrator,
        candidateMgr,
        incidentMgr
      );

      // First selection
      const first = await scheduler.selectNextTopic();
      expect(first.topic).toBeDefined();
      expect(first.categoryIndex).toBe(0);
      expect(first.cluster.id).toBe(DEFAULT_TOPIC_CLUSTERS[0].id);

      // Save state simulating first cycle run
      const state = await scheduler.getState();
      state.lastCategoryIndex = first.categoryIndex;
      state.recentTopics.push({
        cycleId: 'cycle_1',
        topic: first.topic,
        category: first.cluster.name,
        source: first.source,
        timestamp: Date.now(),
        status: 'success',
      });
      await scheduler.saveState(state);

      // Second selection must rotate to cluster 1
      const second = await scheduler.selectNextTopic();
      expect(second.categoryIndex).toBe(1);
      expect(second.cluster.id).toBe(DEFAULT_TOPIC_CLUSTERS[1].id);
      expect(second.topic).not.toEqual(first.topic);
    });

    it('avoids recently researched and approved candidate topics via similarity check', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);
      const incidentMgr = new IncidentManager(storage);
      const tgClient = createMockTelegramClient();
      const orchestrator = new Orchestrator(tgClient, incidentMgr, mockEnv, candidateMgr);

      // Seed candidate manager with an approved candidate
      await candidateMgr.recordCandidate({
        topic: DEFAULT_TOPIC_CLUSTERS[0].topics[0],
        draftText: 'Existing draft text regarding autonomous multi-agent protocol orchestration.',
        suggestedTags: ['AI', 'Agents'],
        sources: ['https://arxiv.org'],
        status: 'approved',
        confidenceScore: 0.95,
      });

      const scheduler = new IntelligentScheduler(
        storage,
        orchestrator,
        candidateMgr,
        incidentMgr
      );

      // Avoidance list should include candidate topic
      const avoidanceList = await scheduler.getAvoidanceTopicsList();
      expect(avoidanceList).toContain(DEFAULT_TOPIC_CLUSTERS[0].topics[0]);

      // When selecting a topic in cluster 0, it must NOT pick the first topic because it is in avoidance list
      const selected = await scheduler.selectNextTopic({ forceCategoryIndex: 0 });
      expect(selected.topic).not.toEqual(DEFAULT_TOPIC_CLUSTERS[0].topics[0]);
      expect(selected.topic).toBe(DEFAULT_TOPIC_CLUSTERS[0].topics[1]);
    });

    it('accurately identifies near-duplicate and similar topic strings', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);
      const incidentMgr = new IncidentManager(storage);
      const tgClient = createMockTelegramClient();
      const orchestrator = new Orchestrator(tgClient, incidentMgr, mockEnv, candidateMgr);

      const scheduler = new IntelligentScheduler(
        storage,
        orchestrator,
        candidateMgr,
        incidentMgr
      );

      const recentTopics = [
        'Event-Driven Multi-Agent Protocol Orchestration in Serverless Environments',
        'Sub-50ms Speculative Decoding on Distributed Edge Worker Nodes',
      ];

      // Exact match
      const check1 = scheduler.isTopicTooSimilar(
        'Event-Driven Multi-Agent Protocol Orchestration in Serverless Environments',
        recentTopics
      );
      expect(check1.isSimilar).toBe(true);

      // Slight lexical variation
      const check2 = scheduler.isTopicTooSimilar(
        'Event Driven Multi Agent Protocol Orchestration on Serverless',
        recentTopics
      );
      expect(check2.isSimilar).toBe(true);

      // Completely distinct topic
      const check3 = scheduler.isTopicTooSimilar(
        'Graph-Augmented Retrieval for Complex Multi-Hop Domain Reasoning',
        recentTopics
      );
      expect(check3.isSimilar).toBe(false);
    });

    it('utilizes dynamic Gemini topic synthesis when available, falling back safely on similarity', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);
      const incidentMgr = new IncidentManager(storage);
      const tgClient = createMockTelegramClient();
      const orchestrator = new Orchestrator(tgClient, incidentMgr, mockEnv, candidateMgr);

      const mockGeminiService: IGeminiService = {
        isConfigured: () => true,
        checkHealth: async () => ({ name: 'gemini', status: 'healthy', critical: false, lastChecked: Date.now() }),
        performResearch: vi.fn().mockResolvedValue({
          topic: 'Novel Autonomous Neuromorphic Computing Paradigms for Edge Swarms',
          summary: 'Detailed summary of emerging neuromorphic architectures.',
          keyTakeaways: ['High energy efficiency', 'Low latency spike trains'],
          suggestedSources: ['https://nature.com/articles/neuromorphic'],
          relevanceScore: 0.94,
          category: 'Autonomous Agents',
        }),
        auditFactCheck: vi.fn(),
        generateTextPlaceholder: vi.fn(),
      };

      const scheduler = new IntelligentScheduler(
        storage,
        orchestrator,
        candidateMgr,
        incidentMgr,
        mockGeminiService
      );

      const selected = await scheduler.selectNextTopic({ forceCategoryIndex: 0 });
      expect(selected.source).toBe('gemini_dynamic');
      expect(selected.topic).toBe('Novel Autonomous Neuromorphic Computing Paradigms for Edge Swarms');
    });

    it('falls back to curated topic when Gemini suggests an already recent topic', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);
      const incidentMgr = new IncidentManager(storage);
      const tgClient = createMockTelegramClient();
      const orchestrator = new Orchestrator(tgClient, incidentMgr, mockEnv, candidateMgr);

      const existingTopic = 'Event-Driven Multi-Agent Protocol Orchestration in Serverless Environments';

      const mockGeminiService: IGeminiService = {
        isConfigured: () => true,
        checkHealth: async () => ({ name: 'gemini', status: 'healthy', critical: false, lastChecked: Date.now() }),
        performResearch: vi.fn().mockResolvedValue({
          topic: existingTopic, // Gemini returns duplicate topic
          summary: 'Duplicate research summary.',
          keyTakeaways: ['Duplicate takeaway'],
          suggestedSources: ['https://arxiv.org'],
          relevanceScore: 0.9,
        }),
        auditFactCheck: vi.fn(),
        generateTextPlaceholder: vi.fn(),
      };

      const scheduler = new IntelligentScheduler(
        storage,
        orchestrator,
        candidateMgr,
        incidentMgr,
        mockGeminiService
      );

      const selected = await scheduler.selectNextTopic({
        forceCategoryIndex: 0,
        avoidanceTopics: [existingTopic],
      });

      // Must detect similarity and fall back to curated cluster rotation
      expect(selected.source).toBe('cluster_rotation');
      expect(selected.topic).not.toEqual(existingTopic);
    });
  });

  describe('Cycle Execution & Safe Handling', () => {
    it('executes a full scheduled cycle in shadow mode without publishing to Telegram', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);
      const incidentMgr = new IncidentManager(storage);
      const tgClient = createMockTelegramClient();
      const orchestrator = new Orchestrator(tgClient, incidentMgr, mockEnv, candidateMgr);

      const scheduler = new IntelligentScheduler(
        storage,
        orchestrator,
        candidateMgr,
        incidentMgr
      );

      const result = await scheduler.executeScheduledCycle({
        cron: '0 */4 * * *',
        scheduledTime: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(result.topic).toBeDefined();
      expect(result.cycleRecord.status).toBe('success');

      // Verify Telegram publish was NEVER called (Shadow mode)
      expect(tgClient.sendMessage).not.toHaveBeenCalled();

      // Verify candidate was recorded in CandidateManager
      const candidates = await candidateMgr.listCandidates();
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].topic).toBe(result.topic);

      // Verify state was saved
      const state = await scheduler.getState();
      expect(state.totalCycles).toBe(1);
      expect(state.successfulCycles).toBe(1);
      expect(state.recentTopics.length).toBe(1);
    });

    it('handles empty or failed research safely and logs incident without crashing', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);
      const incidentMgr = new IncidentManager(storage);
      const tgClient = createMockTelegramClient();
      const orchestrator = new Orchestrator(tgClient, incidentMgr, mockEnv, candidateMgr);

      // Force orchestrator publish error on research.requested to simulate pipeline failure
      vi.spyOn(orchestrator, 'publish').mockImplementation(async (type) => {
        if (type === 'scheduler.cycle_started' || type === 'scheduler.cycle_failed') {
          return { id: 'evt_1', type, timestamp: Date.now(), payload: {} as any };
        }
        if (type === 'research.requested') {
          throw new Error('Downstream pipeline simulated failure');
        }
        return { id: 'evt_other', type, timestamp: Date.now(), payload: {} as any };
      });

      const scheduler = new IntelligentScheduler(
        storage,
        orchestrator,
        candidateMgr,
        incidentMgr
      );

      const result = await scheduler.executeScheduledCycle();
      expect(result.success).toBe(false);
      expect(result.cycleRecord.status).toBe('failed');
      expect(result.error).toContain('Downstream pipeline simulated failure');

      // Incident recorded
      const incidents = await incidentMgr.listIncidents();
      expect(incidents.length).toBe(1);
      expect(incidents[0].component).toBe('Scheduler:IntelligentWorker');

      // State recorded failure
      const state = await scheduler.getState();
      expect(state.failedCycles).toBe(1);
      expect(state.consecutiveFailures).toBe(1);
    });
  });

  describe('Cloudflare Worker Integration', () => {
    it('scheduled() handler uses IntelligentScheduler and handles triggers dynamically', async () => {
      const event: ScheduledEvent = {
        cron: '0 */6 * * *',
        scheduledTime: Date.now(),
        type: 'cron',
      };

      // Execute worker scheduled handler
      await expect(worker.scheduled(event, mockEnv)).resolves.not.toThrow();
    });

    it('GET /api/scheduler returns full cluster and cycle telemetry', async () => {
      const req = new Request('http://localhost/api/scheduler');
      const res = await worker.fetch(req, mockEnv);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.scheduler).toBeDefined();
      expect(body.scheduler.clusters.length).toBe(DEFAULT_TOPIC_CLUSTERS.length);
      expect(body.shadowMode).toBe(true);
    });

    it('POST /api/admin/scheduler/run triggers an intelligent cycle with admin auth', async () => {
      const req = new Request('http://localhost/api/admin/scheduler/run', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sched_admin_secret_456',
        },
      });

      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.topic).toBeDefined();
      expect(body.category).toBeDefined();
      expect(body.shadowMode).toBe(true);
    });

    it('POST /api/admin/scheduler/run rejects unauthorized requests', async () => {
      const req = new Request('http://localhost/api/admin/scheduler/run', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid_secret',
        },
      });

      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(401);
    });
  });
});
