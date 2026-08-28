import { describe, expect, it, vi } from 'vitest';
import { FactCheckerAgent } from '../src/agents/factChecker.ts';
import { ResearcherAgent } from '../src/agents/researcher.ts';
import { StrategistAgent } from '../src/agents/strategist.ts';
import { WriterAgent } from '../src/agents/writer.ts';
import { IGeminiService } from '../src/ai/gemini.ts';
import { Orchestrator } from '../src/orchestrator/orchestrator.ts';
import { ContentGeneratedPayload, GroundedClaim } from '../src/types/index.ts';

describe('Phase 16 — Autonomous Content Quality & Editorial Excellence', () => {
  describe('StrategistAgent Editorial Classification', () => {
    it('accurately classifies product releases and assigns tailored angles', async () => {
      const strategist = new StrategistAgent();
      const result = await strategist.execute({
        id: 'res_01',
        topic: 'vLLM v0.7.0 Released with Chunked Prefill and FlashInfer 2',
        summary: 'vLLM project announces v0.7.0 with chunked prefill and native FlashInfer integration.',
        keyTakeaways: ['Chunked prefill prevents large prompt head-of-line blocking', 'Up to 3x TTFT reduction'],
        suggestedSources: ['https://github.com/vllm-project/vllm/releases/tag/v0.7.0'],
        relevanceScore: 0.95,
      });

      expect(result.success).toBe(true);
      expect(result.data.contentType).toBe('PRODUCT_RELEASE');
      expect(result.data.primaryEntity).toBe('vLLM');
      expect(result.data.targetFormat).toBe('news_summary');
      expect(result.data.hookStrategy).toContain('PRODUCT/ENTITY');
      expect(result.data.editorialGuidance).toContain('State the release milestone clearly');
    });

    it('accurately classifies research breakthroughs and assigns deep dive format', async () => {
      const strategist = new StrategistAgent();
      const result = await strategist.execute({
        id: 'res_02',
        topic: 'DeepSeek-V3 Technical Report: Multi-Head Latent Attention and DualPipe',
        summary: 'Researchers publish architecture details on Multi-Head Latent Attention (MLA) and DualPipe scheduling.',
        keyTakeaways: ['MLA compresses KV cache by 93% with minimal perplexity loss', 'DualPipe overlaps computation and communication'],
        suggestedSources: ['https://arxiv.org/abs/2412.19437'],
        relevanceScore: 0.98,
      });

      expect(result.success).toBe(true);
      expect(result.data.contentType).toBe('RESEARCH');
      expect(result.data.targetFormat).toBe('deep_dive');
      expect(result.data.editorialGuidance).toContain('mechanism achieves the result');
    });

    it('accurately classifies benchmark comparisons', async () => {
      const strategist = new StrategistAgent();
      const result = await strategist.execute({
        id: 'res_03',
        topic: 'GPU Inference Evals: TensorRT-LLM vs vLLM on H100 Hardware',
        summary: 'Empirical benchmark comparison measuring throughput in tokens/s across concurrency levels.',
        keyTakeaways: ['TensorRT-LLM shows higher peak throughput', 'vLLM demonstrates superior memory flexibility'],
        suggestedSources: ['https://semianalysis.com/evals'],
        relevanceScore: 0.91,
      });

      expect(result.success).toBe(true);
      expect(result.data.contentType).toBe('BENCHMARK');
      expect(result.data.targetFormat).toBe('tool_review');
    });
  });

  describe('WriterAgent Formatting & Anti-Slop Discipline', () => {
    it('formats crisp posts with Why it matters and Bottom line, stripping AI cliches', async () => {
      const writer = new WriterAgent();
      const result = await writer.execute({
        topic: 'Deep technical analysis of PagedAttention in vLLM',
        summary: 'Deep technical analysis of how PagedAttention allocates virtual memory in blocks.',
        contentType: 'EXPLAINER',
        primaryEntity: 'vLLM',
        developmentSummary: 'PagedAttention resolves KV cache fragmentation by treating attention states like OS virtual pages.',
        keyTakeaways: [
          'Eliminates internal memory fragmentation from unpredictable sequence lengths.',
          'Enables near-zero memory waste during parallel batch decoding.',
        ],
        suggestedSources: ['https://arxiv.org/abs/2309.06180'],
      });

      expect(result.success).toBe(true);
      const text = result.data.draftText;

      // Must not contain banned AI phrases
      expect(text).not.toContain('Deep technical analysis of');
      expect(text).not.toContain('In today’s fast-paced');
      expect(text).not.toContain('game-changing');

      // Must contain structured components
      expect(text).toContain('*Why it matters:*');
      expect(text).toContain('*Bottom line:*');
      expect(text).toContain('🔗 [Source](https://arxiv.org/abs/2309.06180)');
      expect(text).toMatch(/#[A-Za-z0-9]+/);
    });

    it('integrates with Gemini editorial drafting when service is configured', async () => {
      const mockGemini: IGeminiService = {
        isConfigured: () => true,
        checkHealth: async () => ({ name: 'gemini', status: 'healthy', critical: false, message: 'ok', lastChecked: Date.now() }),
        performResearch: vi.fn(),
        auditFactCheck: vi.fn(),
        generateEditorialDraft: vi.fn().mockResolvedValue({
          draftText: '⚡️ *CLOUDFLARE: Workers AI GPU Scale*\n\nCloudflare announced expanded NVIDIA L40S deployment.\n\n*Why it matters:*\n• Sub-millisecond cold starts\n• Global edge orchestration\n\n*Bottom line:* Lower cost for production inference.\n\n🔗 [Source](https://blog.cloudflare.com)\n#EdgeComputing #AI',
          suggestedTags: ['EdgeComputing', 'AI'],
          contentType: 'PRODUCT_RELEASE',
          primaryEntity: 'Cloudflare',
        }),
        generateTextPlaceholder: vi.fn(),
      };

      const writer = new WriterAgent(mockGemini);
      const result = await writer.execute({
        topic: 'Cloudflare Workers AI GPU Expansion',
        summary: 'Cloudflare expands GPU clusters across 150+ data centers.',
      });

      expect(result.success).toBe(true);
      expect(mockGemini.generateEditorialDraft).toHaveBeenCalled();
      expect(result.data.draftText).toContain('Cloudflare announced expanded NVIDIA L40S deployment');
      expect(result.metadata?.source).toBe('gemini_editorial');
    });
  });

  describe('FactCheckerAgent Strict Grounding Gate', () => {
    it('rejects ungrounded quantitative metric claims when groundedClaims are present', async () => {
      const factChecker = new FactCheckerAgent();

      const groundedClaims: GroundedClaim[] = [
        {
          claim: 'vLLM reduces memory waste via paging',
          source: 'https://vllm.ai',
          claimType: 'sourced_fact',
          verifiedInSource: true,
        },
      ];

      const hallucinatedDraft: ContentGeneratedPayload = {
        contentId: 'draft_hallucinated_01',
        topic: 'vLLM PagedAttention',
        draftText: '⚡️ *VLLM: PagedAttention*\n\nPagedAttention delivers sub-50ms latency and 10x throughput across distributed nodes.\n\n*Why it matters:*\n• Unprecedented performance gains.\n\n*Bottom line:* Essential upgrade.\n\n🔗 [Source](https://vllm.ai)\n#AI',
        suggestedTags: ['AI'],
        sources: ['https://vllm.ai'],
        groundedClaims,
        developmentSummary: 'PagedAttention applies virtual memory paging to LLM key-value cache memory.',
      };

      const result = await factChecker.execute(hallucinatedDraft);
      expect(result.success).toBe(true);
      expect(result.data.passed).toBe(false);
      expect(result.data.rejectionCode).toBe('UNSUPPORTED_QUANTITATIVE_CLAIM');
      expect(result.data.rejectionReason).toContain('ungrounded quantitative metric');
    });

    it('rejects posts containing banned AI fluff or hype clichés', async () => {
      const factChecker = new FactCheckerAgent();

      const hypeDraft: ContentGeneratedPayload = {
        contentId: 'draft_hype_01',
        topic: 'Transformer Architecture Update',
        draftText: '⚡️ *TRANSFORMER: Update*\n\nDeep technical analysis of why this is a revolutionary miracle that will supercharge your systems.\n\n*Why it matters:*\n• Unbelievable trick for developers.\n\n🔗 [Source](https://arxiv.org)\n#AI',
        suggestedTags: ['AI'],
        sources: ['https://arxiv.org'],
      };

      const result = await factChecker.execute(hypeDraft);
      expect(result.success).toBe(true);
      expect(result.data.passed).toBe(false);
      expect(result.data.rejectionCode).toBe('BANNED_HYPE_PATTERNS');
    });

    it('approves rigorously grounded drafts with complete score breakdowns', async () => {
      const factChecker = new FactCheckerAgent();

      const groundedClaims: GroundedClaim[] = [
        {
          claim: 'Chunked prefill splits long user prompts into equal chunks',
          source: 'https://vllm.ai/blog',
          claimType: 'sourced_fact',
          verifiedInSource: true,
        },
      ];

      const validDraft: ContentGeneratedPayload = {
        contentId: 'draft_valid_01',
        topic: 'vLLM Chunked Prefill Architecture',
        draftText: '⚡️ *VLLM: Chunked Prefill*\n\nvLLM introduces chunked prefill to balance long prompt computation with token generation cycles.\n\n*Why it matters:*\n• Chunked prefill splits long user prompts into equal chunks.\n• Prevents queue starvation for concurrent user requests.\n• Keeps GPU compute saturated without latency spikes.\n\n*Bottom line:* Stabilizes inference tail latency for production workloads.\n\n🔗 [Source](https://vllm.ai/blog)\n#LLM #AIInfrastructure #Engineering',
        suggestedTags: ['LLM', 'AIInfrastructure', 'Engineering'],
        sources: ['https://vllm.ai/blog'],
        groundedClaims,
        developmentSummary: 'Chunked prefill splits long user prompts into equal chunks to prevent queue starvation.',
      };

      const result = await factChecker.execute(validDraft);
      expect(result.success).toBe(true);
      expect(result.data.passed).toBe(true);
      expect(result.data.qualityScore).toBeGreaterThanOrEqual(0.85);
      expect(result.data.confidenceScore).toBeGreaterThanOrEqual(0.90);
      expect(result.data.qualityBreakdown?.telegramSuitability).toBeGreaterThanOrEqual(0.90);
    });
  });

  describe('End-to-End Orchestrator Pipeline', () => {
    it('executes full pipeline preserving rich content classification and grounded claims', async () => {
      const orchestrator = new Orchestrator();

      const checkedEvents: any[] = [];
      orchestrator.subscribe('content.checked', async (evt) => {
        checkedEvents.push(evt.payload);
      });

      await orchestrator.publish('research.requested', {
        topic: 'FlashAttention-3: Fast and Accurate Attention with FP8',
        summary: 'FlashAttention-3 leverages NVIDIA Hopper tensor cores and FP8 quantization for attention acceleration.',
        category: 'ai_breakthroughs',
      });

      // Allow async pipeline dispatch to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(checkedEvents.length).toBeGreaterThan(0);
      const checked = checkedEvents[0];
      expect(checked.passed).toBe(true);
      expect(checked.draftText).toContain('*Why it matters:*');
      expect(checked.draftText).toContain('*Bottom line:*');
    });
  });
});
