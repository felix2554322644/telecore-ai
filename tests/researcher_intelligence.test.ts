import { describe, expect, it, vi } from 'vitest';
import { ResearcherAgent } from '../src/agents/researcher.ts';
import { GeminiResearchParams, GeminiResearchResult, IGeminiService } from '../src/ai/gemini.ts';
import { CandidateManager } from '../src/health/candidates.ts';
import { IncidentManager } from '../src/health/incidents.ts';
import worker from '../src/index.ts';
import { Orchestrator } from '../src/orchestrator/orchestrator.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { Env } from '../src/types/index.ts';

describe('Phase 8: Autonomous Research Intelligence', () => {
  const mockGeminiResearch: GeminiResearchResult = {
    topic: 'Deterministic Edge Inference with Speculative Decoding',
    summary:
      'Speculative decoding on edge workers allows compact drafting models to propose multi-token sequences, ' +
      'verified in parallel by quantized models. This reduces TTFT and overall inference latency by 42% on distributed V8 isolates.',
    keyTakeaways: [
      'Speculative draft verification cuts generation latency by over 40%.',
      'Memory footprint fits within standard edge worker isolate limits.',
      'Enables sub-second autonomous agent decision loops.',
    ],
    suggestedSources: [
      'https://arxiv.org/abs/2302.01318',
      'https://developers.cloudflare.com/workers',
    ],
    relevanceScore: 0.94,
    category: 'LLM Architectures',
  };

  const createMockGeminiService = (
    configured = true,
    result: GeminiResearchResult = mockGeminiResearch,
    shouldThrow = false
  ): IGeminiService => ({
    isConfigured: () => configured,
    checkHealth: async () => ({
      name: 'gemini',
      status: configured ? 'healthy' : 'degraded',
      critical: false,
      message: configured ? 'Gemini configured' : 'Gemini not configured',
      lastChecked: Date.now(),
    }),
    performResearch: async (params: GeminiResearchParams) => {
      if (shouldThrow) {
        throw new Error('Gemini API 503 Overloaded');
      }
      return {
        ...result,
        topic: params.topic || result.topic,
      };
    },
    generateTextPlaceholder: async () => 'Placeholder text response',
  });

  describe('ResearcherAgent with Gemini Intelligence', () => {
    it('executes real Gemini-powered research when configured', async () => {
      const mockService = createMockGeminiService(true);
      const performResearchSpy = vi.spyOn(mockService, 'performResearch');

      const researcher = new ResearcherAgent(mockService);

      const result = await researcher.execute({
        niche: 'AI + technology + automation',
        topic: 'Autonomous Speculative Edge Decoding',
        sourceHints: ['https://arxiv.org'],
      });

      expect(result.success).toBe(true);
      expect(performResearchSpy).toHaveBeenCalledTimes(1);
      expect(performResearchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'Autonomous Speculative Edge Decoding',
          niche: 'AI + technology + automation',
          sourceHints: ['https://arxiv.org'],
        })
      );

      expect(result.data).toBeDefined();
      expect(result.data?.topic).toBe('Autonomous Speculative Edge Decoding');
      expect(result.data?.summary).toContain('Speculative decoding');
      expect(result.data?.keyTakeaways.length).toBe(3);
      expect(result.data?.suggestedSources.length).toBe(2);
      expect(result.data?.relevanceScore).toBe(0.94);
      expect(result.metadata?.source).toBe('gemini');
      expect(result.metadata?.intelligence).toBe('autonomous_real');
    });

    it('falls back to structured baseline when Gemini is not configured', async () => {
      const unconfiguredService = createMockGeminiService(false);
      const researcher = new ResearcherAgent(unconfiguredService);

      const result = await researcher.execute({
        niche: 'AI + technology + automation',
        topic: 'Offline Baseline Discovery',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.topic).toBe('Offline Baseline Discovery');
      expect(result.data?.summary).toContain('Deep technical analysis');
      expect(result.data?.relevanceScore).toBeGreaterThanOrEqual(0.8);
      expect(result.metadata?.source).toBe('structured_fallback');
    });

    it('handles Gemini API errors gracefully without crashing the pipeline', async () => {
      const failingService = createMockGeminiService(true, mockGeminiResearch, true);
      const researcher = new ResearcherAgent(failingService);

      const result = await researcher.execute({
        niche: 'AI + technology + automation',
        topic: 'Resilient Failure Recovery Test',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.topic).toBe('Resilient Failure Recovery Test');
      expect(result.metadata?.source).toBe('structured_fallback');
    });

    it('deduplicates repeat research queries within the deduplication window', async () => {
      const mockService = createMockGeminiService(true);
      const performResearchSpy = vi.spyOn(mockService, 'performResearch');

      const researcher = new ResearcherAgent(mockService, 60000);

      // First run: calls Gemini
      const firstResult = await researcher.execute({
        niche: 'AI + technology + automation',
        topic: 'Unique Topic Alpha',
      });
      expect(performResearchSpy).toHaveBeenCalledTimes(1);
      expect(firstResult.data?.deduplicated).toBeFalsy();

      // Immediate second run with same topic: returns deduplicated cached research
      const secondResult = await researcher.execute({
        niche: 'AI + technology + automation',
        topic: 'Unique Topic Alpha',
      });
      expect(performResearchSpy).toHaveBeenCalledTimes(1); // Not called again
      expect(secondResult.data?.deduplicated).toBe(true);
      expect(secondResult.data?.id).toBe(firstResult.data?.id);

      // Different topic: calls Gemini again
      const thirdResult = await researcher.execute({
        niche: 'AI + technology + automation',
        topic: 'Different Topic Beta',
      });
      expect(performResearchSpy).toHaveBeenCalledTimes(2);
      expect(thirdResult.data?.deduplicated).toBeFalsy();
    });
  });

  describe('End-to-End Orchestrator Pipeline with Gemini Research', () => {
    it('dispatches research.requested, synthesizes real research, and stores shadow candidate', async () => {
      const storage = new InMemoryStorageAdapter();
      const incidentMgr = new IncidentManager(storage);
      const candidateMgr = new CandidateManager(storage);
      const mockGemini = createMockGeminiService(true);

      const orchestrator = new Orchestrator(
        undefined,
        incidentMgr,
        { TELEGRAM_TEST_MODE: 'true' },
        candidateMgr,
        mockGemini
      );

      const capturedEvents: string[] = [];
      orchestrator.subscribe('research.requested', () => { capturedEvents.push('research.requested'); });
      orchestrator.subscribe('content.requested', () => { capturedEvents.push('content.requested'); });
      orchestrator.subscribe('content.generated', () => { capturedEvents.push('content.generated'); });
      orchestrator.subscribe('content.checked', () => { capturedEvents.push('content.checked'); });
      orchestrator.subscribe('candidate.recorded', () => { capturedEvents.push('candidate.recorded'); });
      orchestrator.subscribe('content.approved', () => { capturedEvents.push('content.approved'); });

      await orchestrator.publish(
        'research.requested',
        {
          niche: 'AI + technology + automation',
          topic: 'Autonomous Edge Swarm Intelligence',
          sourceHints: ['https://arxiv.org'],
        },
        'corr_research_e2e_1'
      );

      // Verify all pipeline events fired
      expect(capturedEvents).toContain('research.requested');
      expect(capturedEvents).toContain('content.requested');
      expect(capturedEvents).toContain('content.generated');
      expect(capturedEvents).toContain('content.checked');
      expect(capturedEvents).toContain('candidate.recorded');
      expect(capturedEvents).toContain('content.approved');

      // Verify candidate is stored in CandidateManager
      const candidates = await candidateMgr.listCandidates(10, 'approved');
      expect(candidates.length).toBe(1);
      expect(candidates[0].topic).toBe('Autonomous Edge Swarm Intelligence');
      expect(candidates[0].status).toBe('approved');
      expect(candidates[0].draftText).toContain('Autonomous Edge Swarm Intelligence');
      expect(candidates[0].confidenceScore).toBeGreaterThanOrEqual(0.85);
    });

    it('scheduled cron trigger runs full Gemini research in shadow mode without publishing to Telegram', async () => {
      const mockKVStore = new Map<string, string>();
      const mockKV: any = {
        get: async (k: string) => {
          const val = mockKVStore.get(k);
          return val ? JSON.parse(val) : null;
        },
        put: async (k: string, v: string) => {
          mockKVStore.set(k, v);
        },
        delete: async (k: string) => {
          mockKVStore.delete(k);
        },
        list: async ({ prefix }: any = {}) => {
          const keys = Array.from(mockKVStore.keys())
            .filter((k) => !prefix || k.startsWith(prefix))
            .map((name) => ({ name }));
          return { keys, list_complete: true };
        },
      };

      const env: Env = {
        TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        TELEGRAM_WEBHOOK_SECRET: 'test_webhook_sec_123',
        GEMINI_API_KEY: 'test_gemini_key',
        TELEGRAM_CHANNEL_ID: '@telecore_channel',
        ADMIN_SECRET: 'shadow_admin_secret_456',
        ENVIRONMENT: 'production',
        APP_URL: 'https://telecore-ai.workers.dev',
        TELEGRAM_TEST_MODE: 'true',
        STORAGE_KV: mockKV,
      };

      // Execute worker.scheduled
      await worker.scheduled(
        {
          cron: '0 */6 * * *',
          type: 'scheduled',
          scheduledTime: Date.now(),
        },
        env
      );

      // Fetch candidates endpoint to confirm shadow candidate was safely created
      const response = await worker.fetch(
        new Request('https://telecore-ai.workers.dev/api/admin/candidates', {
          headers: { Authorization: 'Bearer shadow_admin_secret_456' },
        }),
        env
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.candidates).toBeDefined();
      expect(data.candidates.length).toBeGreaterThanOrEqual(1);
      expect(data.candidates[0].status).toBe('approved');
      expect(data.candidates[0].topic).toBeDefined();
    });
  });
});
