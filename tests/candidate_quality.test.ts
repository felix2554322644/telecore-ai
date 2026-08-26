import { describe, expect, it, vi } from 'vitest';
import { FactCheckerAgent } from '../src/agents/factChecker.ts';
import { CandidateManager } from '../src/health/candidates.ts';
import { IncidentManager } from '../src/health/incidents.ts';
import { Orchestrator } from '../src/orchestrator/orchestrator.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { ITelegramClient } from '../src/telegram/client.ts';
import { Env, IGeminiService, ShadowCandidate } from '../src/types/index.ts';

describe('Phase 9: Candidate Quality & Selection', () => {
  const mockEnv: Env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_WEBHOOK_SECRET: 'test_webhook_sec_123',
    GEMINI_API_KEY: 'test_gemini_key',
    TELEGRAM_CHANNEL_ID: '@telecore_channel',
    ADMIN_SECRET: 'shadow_admin_secret_456',
    ENVIRONMENT: 'production',
    APP_URL: 'https://telecore-ai.workers.dev',
    TELEGRAM_TEST_MODE: 'true',
  };

  describe('FactCheckerAgent Quality Audit', () => {
    it('detects and rejects promotional hype slop deterministically', async () => {
      const factChecker = new FactCheckerAgent();

      const hypeDraft = {
        contentId: 'draft_hype_001',
        topic: 'Crypto AI Secrets',
        draftText: 'This is a guaranteed mind-blowing trick to get rich quick with 1000x crypto AI secrets! Buy now before it explodes.',
        suggestedTags: ['Crypto', 'AI'],
        sources: ['https://example.com'],
      };

      const result = await factChecker.execute(hypeDraft);
      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.rejectionCode).toBe('BANNED_HYPE_PATTERNS');
      expect(result.data?.confidenceScore).toBeLessThan(0.80);
      expect(result.data?.rejectionReason).toContain('Draft contains promotional hyperbole');
    });

    it('rejects drafts lacking sufficient credible sources', async () => {
      const factChecker = new FactCheckerAgent();

      const unsourcedDraft = {
        contentId: 'draft_unsourced_001',
        topic: 'NextGen LLM Architecture',
        draftText: 'A deep technical overview of Transformer attention mechanisms and sparse matrix multiplication in edge compute environments.',
        suggestedTags: ['AI', 'Architecture'],
        sources: [], // No sources
      };

      const result = await factChecker.execute(unsourcedDraft);
      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(false);
      expect(result.data?.rejectionCode).toBe('INSUFFICIENT_SOURCES');
      expect(result.data?.confidenceScore).toBeLessThan(0.80);
    });

    it('passes high-quality substantive drafts with verified claims and quality breakdown', async () => {
      const factChecker = new FactCheckerAgent();

      const qualityDraft = {
        contentId: 'draft_quality_001',
        topic: 'KV Cache Compression in LLM Inference',
        draftText: 'Modern LLM inference engines optimize memory footprint using multi-query attention and KV cache quantization, reducing VRAM usage by up to 60% while maintaining latency.',
        suggestedTags: ['LLM', 'Inference', 'Engineering'],
        sources: ['https://arxiv.org/abs/2307.09288', 'https://vllm.ai'],
      };

      const result = await factChecker.execute(qualityDraft);
      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.confidenceScore).toBeGreaterThanOrEqual(0.80);
      expect(result.data?.qualityScore).toBeGreaterThanOrEqual(0.75);
      expect(result.data?.qualityBreakdown).toBeDefined();
      expect(result.data?.qualityBreakdown?.factualAccuracy).toBeGreaterThanOrEqual(0.80);
    });

    it('uses Gemini service when available for deep AI fact-checking and quality scoring', async () => {
      const mockGeminiService: IGeminiService = {
        isConfigured: () => true,
        checkHealth: async () => ({
          name: 'gemini',
          status: 'healthy',
          critical: false,
          message: 'Gemini configured',
          lastChecked: Date.now(),
        }),
        performResearch: vi.fn(),
        generateTextPlaceholder: vi.fn(),
        auditFactCheck: vi.fn().mockResolvedValue({
          passed: true,
          qualityScore: 0.94,
          confidenceScore: 0.95,
          qualityBreakdown: {
            factualAccuracy: 0.96,
            technicalDepth: 0.92,
            actionableUtility: 0.90,
            clarityAndTone: 0.95,
            sourceGrounding: 0.97,
          },
          claimsVerified: [
            { claim: 'KV cache quantization reduces memory', verified: true, citation: 'https://vllm.ai' },
          ],
          notes: 'High technical rigor and well-grounded in primary sources.',
        }),
      };

      const factChecker = new FactCheckerAgent(mockGeminiService);

      const draft = {
        contentId: 'draft_ai_001',
        topic: 'vLLM PagedAttention Benchmarks',
        draftText: 'PagedAttention partitions the KV cache into contiguous memory blocks, preventing external fragmentation and boosting throughput by 2-4x in production serving.',
        suggestedTags: ['Inference', 'vLLM'],
        sources: ['https://vllm.ai'],
      };

      const result = await factChecker.execute(draft);
      expect(mockGeminiService.auditFactCheck).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data?.passed).toBe(true);
      expect(result.data?.qualityScore).toBe(0.94);
      expect(result.data?.confidenceScore).toBe(0.95);
      expect(result.data?.qualityBreakdown?.technicalDepth).toBe(0.92);
    });
  });

  describe('CandidateManager Quality Thresholds & Similarity Filtering', () => {
    it('downgrades approved candidates with low confidence score to rejected', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);

      const candidate = await candidateMgr.recordCandidate({
        topic: 'Marginal Quality Topic',
        draftText: 'Short draft with questionable claims and uncertain attribution.',
        status: 'approved',
        confidenceScore: 0.72, // Below 0.80 threshold
        qualityScore: 0.80,
      });

      expect(candidate.status).toBe('rejected');
      expect(candidate.rejectionCode).toBe('LOW_CONFIDENCE_SCORE');
      expect(candidate.rejectionReason).toContain('Confidence score (0.72) is below minimum threshold (0.8)');
    });

    it('downgrades approved candidates with low quality score to rejected', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);

      const candidate = await candidateMgr.recordCandidate({
        topic: 'Superficial Post',
        draftText: 'A very basic post with minimal technical depth or utility.',
        status: 'approved',
        confidenceScore: 0.88,
        qualityScore: 0.65, // Below 0.75 threshold
      });

      expect(candidate.status).toBe('rejected');
      expect(candidate.rejectionCode).toBe('LOW_QUALITY_SCORE');
      expect(candidate.rejectionReason).toContain('Quality score (0.65) is below minimum threshold (0.75)');
    });

    it('detects fuzzy topic similarity and rejects duplicate topic candidates', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);

      // Record first approved candidate
      const cand1 = await candidateMgr.recordCandidate({
        topic: 'Autonomous AI Agents Architecture in 2026',
        draftText: 'Detailed breakdown of multi-agent architectures, event loops, and autonomous self-healing mechanisms.',
        status: 'approved',
        confidenceScore: 0.95,
        qualityScore: 0.90,
      });
      expect(cand1.status).toBe('approved');

      // Attempt to record a highly similar topic with different wording
      const cand2 = await candidateMgr.recordCandidate({
        topic: 'Autonomous AI Agents Architecture for 2026',
        draftText: 'A guide to multi-agent architectures and autonomous self-healing event loops.',
        status: 'approved',
        confidenceScore: 0.95,
        qualityScore: 0.90,
      });

      expect(cand2.status).toBe('rejected');
      expect(cand2.rejectionCode).toBe('DUPLICATE_TOPIC_SIMILARITY');
      expect(cand2.rejectionReason).toContain('Rejected as duplicate');
      expect(cand2.metadata?.similarityMatch).toBeDefined();
    });

    it('calculates average quality and confidence score metrics in stats', async () => {
      const storage = new InMemoryStorageAdapter();
      const candidateMgr = new CandidateManager(storage);

      await candidateMgr.recordCandidate({
        topic: 'Topic A',
        draftText: 'Text A content string with high quality and depth.',
        status: 'approved',
        confidenceScore: 0.90,
        qualityScore: 0.85,
      });

      await candidateMgr.recordCandidate({
        topic: 'Topic B',
        draftText: 'Text B content string with top tier analysis.',
        status: 'approved',
        confidenceScore: 0.96,
        qualityScore: 0.95,
      });

      const stats = await candidateMgr.getCandidateStats();
      expect(stats.total).toBe(2);
      expect(stats.approved).toBe(2);
      expect(stats.rejected).toBe(0);
      expect(stats.avgQualityScore).toBe(0.90);
      expect(stats.avgConfidenceScore).toBe(0.93);
    });
  });

  describe('End-to-End Orchestrator Pipeline with Quality Gates', () => {
    it('runs end-to-end pipeline in shadow mode with fact-checking and quality gates, keeping Telegram disabled', async () => {
      const storage = new InMemoryStorageAdapter();
      const incidentMgr = new IncidentManager(storage);
      const candidateMgr = new CandidateManager(storage);

      const mockSendMessage = vi.fn();
      const mockTelegramClient: ITelegramClient = {
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

      const orchestrator = new Orchestrator(mockTelegramClient, incidentMgr, mockEnv, candidateMgr);

      const recordedCandidates: ShadowCandidate[] = [];
      orchestrator.subscribe('candidate.recorded', (event) => {
        recordedCandidates.push(event.payload as ShadowCandidate);
      });

      // Dispatch high quality research request
      await orchestrator.publish('research.requested', {
        niche: 'AI + technology + automation',
        topic: 'Edge AI Inference Architectures and Quantization',
      });

      // Candidate must be recorded in CandidateManager
      const stored = await candidateMgr.listCandidates();
      expect(stored.length).toBe(1);
      expect(stored[0].qualityScore).toBeDefined();
      expect(stored[0].confidenceScore).toBeDefined();

      // Telegram publish MUST NOT be triggered
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });
});
