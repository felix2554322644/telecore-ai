import { describe, expect, it } from 'vitest';
import { AnalystAgent } from '../src/agents/analyst.ts';
import { CandidateManager } from '../src/health/candidates.ts';
import { IncidentManager } from '../src/health/incidents.ts';
import { Orchestrator } from '../src/orchestrator/orchestrator.ts';
import { DEFAULT_TOPIC_CLUSTERS, IntelligentScheduler } from '../src/scheduler/intelligentScheduler.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { QualityBreakdown, ShadowCandidate } from '../src/types/index.ts';
import worker from '../src/index.ts';

describe('Phase 11 — Feedback & Learning Loop', () => {
  const sampleQualityBreakdown: QualityBreakdown = {
    factualAccuracy: 0.94,
    technicalDepth: 0.90,
    actionableUtility: 0.88,
    clarityAndTone: 0.95,
    sourceGrounding: 0.92,
  };

  it('should initialize AnalystAgent with feedback & learning capability', () => {
    const storage = new InMemoryStorageAdapter();
    const candidateManager = new CandidateManager(storage);
    const analyst = new AnalystAgent(storage, candidateManager);

    expect(analyst.metadata.name).toBe('AnalystAgent');
    expect(analyst.metadata.role).toBe('analyst');
    expect(analyst.canHandle({ id: '1', type: 'candidate.recorded', timestamp: Date.now(), payload: {} })).toBe(true);
    expect(analyst.canHandle({ id: '2', type: 'content.published', timestamp: Date.now(), payload: {} })).toBe(true);
  });

  it('should generate baseline feedback report when candidate pool is empty', async () => {
    const storage = new InMemoryStorageAdapter();
    const candidateManager = new CandidateManager(storage);
    const analyst = new AnalystAgent(storage, candidateManager);

    const report = await analyst.generateFeedbackReport();

    expect(report.totalEvaluatedCandidates).toBe(0);
    expect(report.overallApprovalRate).toBe(1.0);
    expect(report.topPerformingClusters.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(Object.keys(report.clusterPerformance).length).toBe(DEFAULT_TOPIC_CLUSTERS.length);
  });

  it('should aggregate candidate quality scores and compute learned weights per cluster', async () => {
    const storage = new InMemoryStorageAdapter();
    const candidateManager = new CandidateManager(storage);
    const analyst = new AnalystAgent(storage, candidateManager);

    // Seed candidate for 'Autonomous Agent Architectures' (High quality, approved)
    await candidateManager.recordCandidate({
      contentId: 'cand_agent_1',
      correlationId: 'corr_1',
      topic: 'Autonomous Multi-Agent Task Routing in TypeScript',
      draftText: 'Detailed technical guide on autonomous agent orchestrator pipelines in Cloudflare Workers with durable state management and event-driven architectures. Always verify claims through telemetry and deterministic fallbacks for high reliability.',
      sources: ['https://cloudflare.com/workers', 'https://github.com/microsoft/autogen'],
      suggestedTags: ['AI', 'Agents', 'TypeScript'],
      qualityScore: 0.96,
      confidenceScore: 0.98,
      qualityBreakdown: {
        factualAccuracy: 0.98,
        technicalDepth: 0.95,
        actionableUtility: 0.94,
        clarityAndTone: 0.97,
        sourceGrounding: 0.96,
      },
      claimsVerified: [
        { claim: 'Runs on Cloudflare Workers', verified: true },
        { claim: 'TypeScript event routing', verified: true },
      ],
      status: 'approved',
    });

    // Seed candidate for 'AI Security & Prompt Defenses' (Lower quality / rejected)
    await candidateManager.recordCandidate({
      contentId: 'cand_sec_1',
      correlationId: 'corr_2',
      topic: 'AI Prompt Injection Defense Best Practices',
      draftText: 'Short note on prompt injection.',
      sources: ['https://owasp.org'],
      suggestedTags: ['Security'],
      qualityScore: 0.62,
      confidenceScore: 0.60,
      qualityBreakdown: {
        factualAccuracy: 0.70,
        technicalDepth: 0.55,
        actionableUtility: 0.60,
        clarityAndTone: 0.75,
        sourceGrounding: 0.50,
      },
      status: 'rejected',
      rejectionCode: 'LOW_FACTUAL_CONFIDENCE',
      rejectionReason: 'Draft lacks technical depth and source grounding.',
    });

    const report = await analyst.generateFeedbackReport();

    expect(report.totalEvaluatedCandidates).toBe(2);
    expect(report.overallApprovalRate).toBe(0.5);

    // Verify cluster performance metrics
    const agentClusterPerf = report.clusterPerformance['autonomous_agents'];
    const secClusterPerf = report.clusterPerformance['ai_safety_guardrails'];

    expect(agentClusterPerf).toBeDefined();
    expect(agentClusterPerf.approvedCount).toBe(1);
    expect(agentClusterPerf.rejectedCount).toBe(0);
    expect(agentClusterPerf.approvalRate).toBe(1.0);
    expect(agentClusterPerf.avgQualityScore).toBe(0.96);
    expect(agentClusterPerf.learnedWeight).toBeGreaterThan(1.0);

    expect(secClusterPerf).toBeDefined();
    expect(secClusterPerf.approvedCount).toBe(0);
    expect(secClusterPerf.rejectedCount).toBe(1);
    expect(secClusterPerf.approvalRate).toBe(0.0);
    expect(secClusterPerf.avgQualityScore).toBe(0.62);
    expect(secClusterPerf.learnedWeight).toBeLessThan(agentClusterPerf.learnedWeight);
    expect(secClusterPerf.commonRejectionCodes[0].code).toBe('LOW_FACTUAL_CONFIDENCE');
  });

  it('should calculate content characteristics and optimal word ranges', async () => {
    const storage = new InMemoryStorageAdapter();
    const candidateManager = new CandidateManager(storage);
    const analyst = new AnalystAgent(storage, candidateManager);

    await candidateManager.recordCandidate({
      contentId: 'cand_words_1',
      topic: 'Edge LLM Inference Optimization',
      draftText: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.',
      sources: ['https://example.com/source1', 'https://example.com/source2'],
      suggestedTags: ['EdgeAI', 'Performance'],
      qualityScore: 0.92,
      confidenceScore: 0.95,
      status: 'approved',
      claimsVerified: [{ claim: 'Inference latency under 10ms', verified: true }],
    });

    const report = await analyst.generateFeedbackReport();
    const chars = report.contentCharacteristics;

    expect(chars.avgSourcesCount).toBeGreaterThanOrEqual(1);
    expect(chars.optimalWordRange.min).toBeDefined();
    expect(chars.optimalWordRange.max).toBeDefined();
    expect(chars.claimVerificationRate).toBe(1.0);
    expect(chars.topPerformingTags.some((t) => t.tag === 'edgeai' || t.tag === 'performance')).toBe(true);
  });

  it('should influence IntelligentScheduler topic selection using feedback weights', async () => {
    const storage = new InMemoryStorageAdapter();
    const candidateManager = new CandidateManager(storage);
    const incidentManager = new IncidentManager(storage);
    const orchestrator = new Orchestrator(undefined, incidentManager, undefined, candidateManager, undefined, storage);
    const scheduler = new IntelligentScheduler(storage, orchestrator, candidateManager, incidentManager);

    // Initial topic selection
    const selected1 = await scheduler.selectNextTopic();
    expect(selected1.topic).toBeDefined();
    expect(selected1.cluster).toBeDefined();

    // Verify scheduler status includes feedback summary
    const status = await scheduler.getStatus();
    expect(status.clusters[0].learnedWeight).toBeDefined();
    expect(status.feedbackSummary).toBeDefined();
  });

  it('should trigger feedback learning loop on candidate.recorded event via orchestrator', async () => {
    const storage = new InMemoryStorageAdapter();
    const candidateManager = new CandidateManager(storage);
    const incidentManager = new IncidentManager(storage);
    const orchestrator = new Orchestrator(undefined, incidentManager, undefined, candidateManager, undefined, storage);

    await candidateManager.recordCandidate({
      contentId: 'cand_event_1',
      topic: 'Event Driven Cloudflare Architecture',
      draftText: 'Comprehensive architecture report on Cloudflare event bus and KV stores with micro-queues.',
      sources: ['https://developers.cloudflare.com'],
      suggestedTags: ['Architecture', 'Cloudflare'],
      qualityScore: 0.91,
      confidenceScore: 0.94,
      status: 'approved',
    });

    await orchestrator.publish('candidate.recorded', { contentId: 'cand_event_1' });

    const report = await orchestrator.analyst.getFeedbackReport();
    expect(report.totalEvaluatedCandidates).toBe(1);
    expect(report.overallApprovalRate).toBe(1.0);
  });

  it('should serve GET /api/analytics/feedback and POST /api/analytics/feedback/refresh', async () => {
    const mockEnv = {
      ENVIRONMENT: 'test',
      TELEGRAM_BOT_TOKEN: '123456789:AAFakeTokenForTestingOnly_Safe',
      TELEGRAM_CHANNEL_ID: '@techpluseai',
      ADMIN_SECRET: 'test-admin-secret-xyz',
    };

    // 1. GET /api/analytics/feedback
    const reqGet = new Request('http://localhost/api/analytics/feedback', { method: 'GET' });
    const resGet = await worker.fetch(reqGet, mockEnv as any);
    expect(resGet.status).toBe(200);
    const dataGet = (await resGet.json()) as any;
    expect(dataGet.ok).toBe(true);
    expect(dataGet.shadowMode).toBe(true);
    expect(dataGet.report).toBeDefined();
    expect(dataGet.report.clusterPerformance).toBeDefined();

    // 2. POST /api/analytics/feedback/refresh
    const reqPost = new Request('http://localhost/api/analytics/feedback/refresh', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-admin-secret-xyz',
      },
    });
    const resPost = await worker.fetch(reqPost, mockEnv as any);
    expect(resPost.status).toBe(200);
    const dataPost = (await resPost.json()) as any;
    expect(dataPost.ok).toBe(true);
    expect(dataPost.report).toBeDefined();
    expect(dataPost.message).toContain('Feedback analysis refreshed');
  });
});
