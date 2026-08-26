/**
 * Autonomous Telegram Channel Manager - Intelligent Topic Scheduler
 *
 * Phase 10: Intelligent Scheduling & Topic Selection
 * - Intelligently selects diverse research topics across curated technical clusters.
 * - Enforces recent-topic avoidance via similarity scoring & candidate history inspection.
 * - Dynamic AI topic synthesis via Gemini when configured, with deterministic fallback.
 * - Safe handling of empty/failed research cycles with automatic cluster rotation & retries.
 * - Operates strictly in SHADOW MODE: Telegram publishing remains completely disabled.
 */

import { IGeminiService } from '../ai/gemini.ts';
import { CandidateManager } from '../health/candidates.ts';
import { IncidentManager } from '../health/incidents.ts';
import { Orchestrator } from '../orchestrator/orchestrator.ts';
import {
  IStorage,
  ScheduledCycleRecord,
  SchedulerState,
  SchedulerStatus,
  TopicCluster,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('Scheduler:IntelligentWorker');

export const DEFAULT_TOPIC_CLUSTERS: TopicCluster[] = [
  {
    id: 'autonomous_agents',
    name: 'Autonomous Agent Architectures & Self-Healing Loops',
    description: 'Multi-agent orchestration, state machines, self-repair pipelines, and deterministic loops.',
    sourceHints: ['https://arxiv.org', 'https://github.com/trending', 'https://techpluseai.internal/radar/agents'],
    topics: [
      'Event-Driven Multi-Agent Protocol Orchestration in Serverless Environments',
      'Autonomous Self-Healing Feedback Loops for Cloud Microservices',
      'Deterministic State Machine Verification for Autonomous LLM Pipelines',
      'Hierarchical Context Memory Compression in Multi-Agent Swarms',
      'Sandboxed Code Execution Guardrails for Autonomous Coding Agents',
    ],
  },
  {
    id: 'edge_llm_inference',
    name: 'Edge LLM Inference & Memory Optimization',
    description: 'Low-latency edge model serving, quantization, KV cache paging, and speculative decoding.',
    sourceHints: ['https://developers.cloudflare.com', 'https://arxiv.org', 'https://huggingface.co/blog'],
    topics: [
      'Sub-50ms Speculative Decoding on Distributed Edge Worker Nodes',
      'Dynamic KV-Cache Paging and Quantization for Memory-Constrained LLM Serving',
      'High-Throughput Continuous Batching Runtimes: vLLM vs SGLang',
      'In-Browser Small Language Model Execution via WebGPU and WebAssembly',
      'Context-Free Grammar Guided Structured Generation at Edge Latency',
    ],
  },
  {
    id: 'developer_automation',
    name: 'Developer Tooling & Workflow Automation',
    description: 'AI-assisted codemods, continuous eval harnesses, automated CI/CD remediation, and developer tools.',
    sourceHints: ['https://github.blog', 'https://news.ycombinator.com', 'https://techpluseai.internal/radar/devtools'],
    topics: [
      'Automated Abstract Syntax Tree (AST) Codemods via Schema-Constrained LLMs',
      'Continuous Red-Teaming & Benchmark Harnesses for Production Agent Systems',
      'Zero-Downtime Agent Schema Migrations in Distributed Serverless Architectures',
      'AI-Assisted Root Cause Diagnostics on High-Volume Cloud Observability Streams',
      'Sub-Millisecond CLI Tooling Powered by Local Embeddings and Fast Tokenizers',
    ],
  },
  {
    id: 'vector_retrieval',
    name: 'Vector Retrieval & Knowledge Grounding',
    description: 'Hybrid search, neural rerankers, knowledge graphs, and semantic index caching.',
    sourceHints: ['https://arxiv.org', 'https://qdrant.tech/articles', 'https://pinecone.io/blog'],
    topics: [
      'Hybrid Dense-Sparse Reranking with Multi-Vector Cross-Encoders',
      'Graph-Augmented Retrieval for Complex Multi-Hop Domain Reasoning',
      'Contextual Chunk Compression and Token-Efficient Grounding Strategies',
      'Real-Time Semantic Partitioning on Distributed Key-Value Edge Stores',
      'Deduplication & Near-Duplicate Filtering for Continuous Knowledge Ingestion',
    ],
  },
  {
    id: 'ai_safety_guardrails',
    name: 'AI Safety, Fact-Checking & Deterministic Guardrails',
    description: 'Hallucination defense, deterministic safety gates, confidence scoring, and prompt hygiene.',
    sourceHints: ['https://arxiv.org', 'https://techpluseai.internal/radar/safety'],
    topics: [
      'Multi-Tier Deterministic Guardrails for Autonomous Channel Publishing',
      'Schema-Grounded Fact-Checking and Source Verification Engines',
      'Prompt Injection Defense Patterns in External Ingestion Webhooks',
      'Calibrated Confidence Scoring and Quality Thresholds in Autonomous Systems',
      'Zero-Hallucination Fallback Architectures for Real-Time AI Workflows',
    ],
  },
  {
    id: 'realtime_serverless',
    name: 'Real-Time Streaming & Serverless Compute Systems',
    description: 'Server-Sent Events, WebSockets, durable objects, and zero-dependency micro-frameworks.',
    sourceHints: ['https://cloudflare.com/blog', 'https://aws.amazon.com/blogs/compute'],
    topics: [
      'Bidirectional Server-Sent Events for Interactive Autonomous Agent Feedback',
      'Durable State Synchronization Across Ephemeral Edge Micro-Isolates',
      'Zero-Cold-Start Serverless Micro-Runtimes for Ephemeral AI Workloads',
      'Resilient In-Memory Storage Adapters with Deterministic Expiration TTLs',
      'Sub-Millisecond Edge Routing for Global Autonomous Agent Endpoints',
    ],
  },
];

export class IntelligentScheduler {
  private storage: IStorage;
  private orchestrator: Orchestrator;
  private candidateManager: CandidateManager;
  private incidentManager: IncidentManager;
  private geminiService?: IGeminiService;
  private clusters: TopicCluster[];
  private readonly stateKey = 'scheduler:state';
  private readonly recentLimit = 30;
  private readonly similarityThreshold = 0.65;

  constructor(
    storage: IStorage,
    orchestrator: Orchestrator,
    candidateManager: CandidateManager,
    incidentManager: IncidentManager,
    geminiService?: IGeminiService,
    customClusters?: TopicCluster[]
  ) {
    this.storage = storage;
    this.orchestrator = orchestrator;
    this.candidateManager = candidateManager;
    this.incidentManager = incidentManager;
    this.geminiService = geminiService;
    this.clusters = customClusters && customClusters.length > 0 ? customClusters : DEFAULT_TOPIC_CLUSTERS;
  }

  /**
   * Loads current scheduler state from storage or initializes a default state
   */
  public async getState(): Promise<SchedulerState> {
    try {
      const stored = await this.storage.get<SchedulerState>(this.stateKey);
      if (stored) {
        return {
          lastCategoryIndex: typeof stored.lastCategoryIndex === 'number' ? stored.lastCategoryIndex : -1,
          lastScheduledAt: stored.lastScheduledAt,
          totalCycles: stored.totalCycles || 0,
          successfulCycles: stored.successfulCycles || 0,
          failedCycles: stored.failedCycles || 0,
          recentTopics: Array.isArray(stored.recentTopics) ? stored.recentTopics : [],
          consecutiveFailures: stored.consecutiveFailures || 0,
        };
      }
    } catch (err) {
      logger.warn('scheduler_state_load_failed', 'Failed to load scheduler state from storage, using initial state', {
        error: err,
      });
    }

    return {
      lastCategoryIndex: -1,
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      recentTopics: [],
      consecutiveFailures: 0,
    };
  }

  /**
   * Persists scheduler state
   */
  public async saveState(state: SchedulerState): Promise<void> {
    try {
      // Trim recent topics to limit
      if (state.recentTopics.length > this.recentLimit) {
        state.recentTopics = state.recentTopics.slice(0, this.recentLimit);
      }
      await this.storage.set(this.stateKey, state, {
        expirationTtl: 60 * 24 * 60 * 60, // 60 days
      });
    } catch (err) {
      logger.error('scheduler_state_save_failed', 'Failed to persist scheduler state in storage', {
        error: err,
      });
    }
  }

  /**
   * Aggregates recent topics to avoid from both scheduled run history and candidate records
   */
  public async getAvoidanceTopicsList(): Promise<string[]> {
    const list: string[] = [];
    const seen = new Set<string>();

    // 1. Get from scheduler state
    const state = await this.getState();
    for (const item of state.recentTopics) {
      if (item.topic && item.topic.trim()) {
        const norm = item.topic.trim().toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          list.push(item.topic.trim());
        }
      }
    }

    // 2. Get from CandidateManager history (approved & rejected candidates)
    try {
      const candidates = await this.candidateManager.listCandidates(40);
      for (const cand of candidates) {
        if (cand.topic && cand.topic.trim()) {
          const norm = cand.topic.trim().toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            list.push(cand.topic.trim());
          }
        }
      }
    } catch (err) {
      logger.warn('scheduler_candidate_list_failed', 'Failed to load candidates for topic avoidance list', {
        error: err,
      });
    }

    return list;
  }

  /**
   * Checks whether a candidate topic is too similar to any recently scheduled or published topic
   */
  public isTopicTooSimilar(
    topic: string,
    avoidanceTopics: string[],
    threshold = this.similarityThreshold
  ): { isSimilar: boolean; matchedTopic?: string; similarityScore?: number } {
    const tokenSim = (t1: string, t2: string) => {
      const tokens1 = this.candidateManager.tokenize(t1);
      const tokens2 = this.candidateManager.tokenize(t2);
      if (tokens1.size === 0 || tokens2.size === 0) return 0;
      let intersect = 0;
      for (const t of tokens1) {
        if (tokens2.has(t)) intersect++;
      }
      return intersect / (tokens1.size + tokens2.size - intersect);
    };

    const ngramSim = (t1: string, t2: string) => {
      const getNgrams = (s: string) => {
        const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const ngrams = new Set<string>();
        for (let i = 0; i <= clean.length - 3; i++) {
          ngrams.add(clean.substring(i, i + 3));
        }
        return ngrams;
      };
      const n1 = getNgrams(t1);
      const n2 = getNgrams(t2);
      if (n1.size === 0 || n2.size === 0) return 0;
      let intersect = 0;
      for (const ng of n1) {
        if (n2.has(ng)) intersect++;
      }
      return intersect / (n1.size + n2.size - intersect);
    };

    for (const recent of avoidanceTopics) {
      const tSim = tokenSim(topic, recent);
      const nSim = ngramSim(topic, recent);
      const maxScore = Number(Math.max(tSim, nSim).toFixed(3));

      if (maxScore >= threshold) {
        return {
          isSimilar: true,
          matchedTopic: recent,
          similarityScore: maxScore,
        };
      }
    }

    return { isSimilar: false };
  }

  /**
   * Intelligently selects the next research topic:
   * 1. Rotates category cluster index.
   * 2. Checks against recent-topic avoidance list.
   * 3. Uses Gemini dynamic generation if available.
   * 4. Falls back to clean curated cluster rotation.
   */
  public async selectNextTopic(options?: {
    forceCategoryIndex?: number;
    avoidanceTopics?: string[];
  }): Promise<{
    topic: string;
    cluster: TopicCluster;
    source: 'gemini_dynamic' | 'cluster_rotation' | 'fallback_recovery';
    categoryIndex: number;
  }> {
    const state = await this.getState();
    const avoidanceTopics = options?.avoidanceTopics || (await this.getAvoidanceTopicsList());

    // Compute rotated category index
    let nextIndex =
      typeof options?.forceCategoryIndex === 'number'
        ? options.forceCategoryIndex % this.clusters.length
        : (state.lastCategoryIndex + 1) % this.clusters.length;

    if (nextIndex < 0) nextIndex = 0;
    const targetCluster = this.clusters[nextIndex];

    logger.info('scheduler_topic_selection_started', `Selecting topic for cluster: "${targetCluster.name}" (${targetCluster.id})`, {
      context: {
        categoryIndex: nextIndex,
        avoidanceCount: avoidanceTopics.length,
        hasGemini: Boolean(this.geminiService?.isConfigured()),
      },
    });

    // 1. Try Gemini Dynamic Synthesis if configured
    if (this.geminiService && this.geminiService.isConfigured()) {
      try {
        const promptTopic = `High-signal emerging innovation in ${targetCluster.name}`;
        const research = await this.geminiService.performResearch({
          topic: promptTopic,
          niche: 'AI + technology + automation',
          sourceHints: targetCluster.sourceHints,
          maxItems: 3,
        });

        if (research.topic && research.topic.trim().length > 10) {
          const similarityCheck = this.isTopicTooSimilar(research.topic, avoidanceTopics);
          if (!similarityCheck.isSimilar) {
            logger.info('scheduler_topic_selected_gemini', `Gemini dynamically generated novel topic: "${research.topic}"`, {
              context: { cluster: targetCluster.id, topic: research.topic },
            });
            return {
              topic: research.topic.trim(),
              cluster: targetCluster,
              source: 'gemini_dynamic',
              categoryIndex: nextIndex,
            };
          } else {
            logger.info(
              'scheduler_gemini_topic_avoided',
              `Gemini topic "${research.topic}" was too similar to recent topic "${similarityCheck.matchedTopic}" (${similarityCheck.similarityScore}), falling back to cluster pool`
            );
          }
        }
      } catch (err) {
        logger.warn('scheduler_gemini_dynamic_failed', 'Dynamic Gemini topic selection encountered error, falling back to curated pool', {
          error: err,
        });
      }
    }

    // 2. Curated cluster pool rotation with recent topic avoidance
    for (let clusterOffset = 0; clusterOffset < this.clusters.length; clusterOffset++) {
      const activeIdx = (nextIndex + clusterOffset) % this.clusters.length;
      const currentCluster = this.clusters[activeIdx];

      for (const candidateTopic of currentCluster.topics) {
        const similarity = this.isTopicTooSimilar(candidateTopic, avoidanceTopics);
        if (!similarity.isSimilar) {
          logger.info('scheduler_topic_selected_cluster', `Selected curated topic from rotation: "${candidateTopic}" in [${currentCluster.name}]`, {
            context: { cluster: currentCluster.id, topic: candidateTopic, categoryIndex: activeIdx },
          });
          return {
            topic: candidateTopic,
            cluster: currentCluster,
            source: 'cluster_rotation',
            categoryIndex: activeIdx,
          };
        }
      }
    }

    // 3. Fallback recovery with variation timestamp if all curated topics are in avoidance list
    const fallbackTopic = `${targetCluster.topics[0]} (Architecture Update ${new Date().toISOString().split('T')[0]})`;
    logger.info('scheduler_topic_selected_fallback', `All topics active in avoidance list; generating fallback variation: "${fallbackTopic}"`, {
      context: { cluster: targetCluster.id, topic: fallbackTopic },
    });

    return {
      topic: fallbackTopic,
      cluster: targetCluster,
      source: 'fallback_recovery',
      categoryIndex: nextIndex,
    };
  }

  /**
   * Executes a scheduled autonomous cycle:
   * - Selects intelligent topic.
   * - Publishes events to the orchestrator.
   * - Retains shadow mode (no Telegram publish).
   * - Handles empty or failed research safely with retries and incident recording.
   */
  public async executeScheduledCycle(triggerInfo?: {
    cron?: string;
    scheduledTime?: number;
    isManualTrigger?: boolean;
    correlationId?: string;
  }): Promise<{
    success: boolean;
    topic: string;
    category: string;
    cycleRecord: ScheduledCycleRecord;
    error?: string;
  }> {
    const startTime = Date.now();
    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const correlationId = triggerInfo?.correlationId || `cron_${triggerInfo?.scheduledTime || Date.now()}`;

    logger.info('scheduler_cycle_started', `Scheduled intelligent cycle ${cycleId} started`, {
      correlationId,
      context: { cron: triggerInfo?.cron, isManualTrigger: triggerInfo?.isManualTrigger },
    });

    // Notify event bus
    await this.orchestrator.publish(
      'scheduler.cycle_started',
      {
        cycleId,
        cron: triggerInfo?.cron,
        scheduledTime: triggerInfo?.scheduledTime,
        isManualTrigger: triggerInfo?.isManualTrigger,
      },
      correlationId
    );

    const state = await this.getState();
    const avoidanceTopics = await this.getAvoidanceTopicsList();

    let selected: Awaited<ReturnType<typeof this.selectNextTopic>>;
    try {
      selected = await this.selectNextTopic({ avoidanceTopics });
    } catch (err) {
      logger.error('scheduler_topic_selection_critical', 'Failed to select next topic', { error: err });
      const record: ScheduledCycleRecord = {
        cycleId,
        topic: 'Autonomous AI Agents & Edge Infrastructure',
        category: 'Autonomous Agents',
        source: 'fallback_recovery',
        timestamp: Date.now(),
        cron: triggerInfo?.cron,
        status: 'failed',
        rejectionReason: err instanceof Error ? err.message : 'Topic selection exception',
        correlationId,
        durationMs: Date.now() - startTime,
      };

      state.totalCycles++;
      state.failedCycles++;
      state.consecutiveFailures++;
      state.recentTopics.unshift(record);
      await this.saveState(state);

      await this.incidentManager.recordIncident({
        component: 'Scheduler:IntelligentWorker',
        severity: 'high',
        error: `Topic selection failed: ${record.rejectionReason}`,
        context: { cycleId, correlationId },
      });

      await this.orchestrator.publish('scheduler.cycle_failed', record, correlationId);
      return { success: false, topic: record.topic, category: record.category, cycleRecord: record, error: record.rejectionReason };
    }

    // Execute research through Orchestrator Event Bus
    const payload = {
      niche: 'AI + technology + automation',
      topic: selected.topic,
      sourceHints: selected.cluster.sourceHints,
      isScheduledTrigger: true,
      cron: triggerInfo?.cron,
    };

    try {
      // 1. Dispatch research event to orchestrator
      await this.orchestrator.publish('research.requested', payload, correlationId);

      // Verify cycle completed properly in candidate manager or cache
      const recentCandidates = await this.candidateManager.listCandidates(5);
      const matchingCand = recentCandidates.find(
        (c) => c.correlationId === correlationId || c.topic.trim().toLowerCase() === selected.topic.trim().toLowerCase()
      );

      const cycleRecord: ScheduledCycleRecord = {
        cycleId,
        topic: selected.topic,
        category: selected.cluster.name,
        source: selected.source,
        timestamp: Date.now(),
        cron: triggerInfo?.cron,
        status: matchingCand?.status === 'rejected' ? 'filtered' : 'success',
        candidateId: matchingCand?.id,
        rejectionReason: matchingCand?.rejectionReason,
        correlationId,
        durationMs: Date.now() - startTime,
      };

      state.lastCategoryIndex = selected.categoryIndex;
      state.lastScheduledAt = Date.now();
      state.totalCycles++;
      if (cycleRecord.status === 'success' || cycleRecord.status === 'filtered') {
        state.successfulCycles++;
        state.consecutiveFailures = 0;
      } else {
        state.failedCycles++;
      }
      state.recentTopics.unshift(cycleRecord);
      await this.saveState(state);

      logger.info('scheduler_cycle_completed', `Scheduled cycle ${cycleId} completed for "${selected.topic}" [${cycleRecord.status}]`, {
        correlationId,
        context: { candidateId: matchingCand?.id, status: cycleRecord.status },
      });

      await this.orchestrator.publish('scheduler.cycle_completed', cycleRecord, correlationId);

      return {
        success: true,
        topic: selected.topic,
        category: selected.cluster.name,
        cycleRecord,
      };
    } catch (pipelineErr) {
      const errorMsg = pipelineErr instanceof Error ? pipelineErr.message : 'Pipeline execution error';
      logger.error('scheduler_pipeline_execution_failed', `Pipeline failure for topic "${selected.topic}"`, {
        correlationId,
        error: pipelineErr,
      });

      const cycleRecord: ScheduledCycleRecord = {
        cycleId,
        topic: selected.topic,
        category: selected.cluster.name,
        source: selected.source,
        timestamp: Date.now(),
        cron: triggerInfo?.cron,
        status: 'failed',
        rejectionReason: errorMsg,
        correlationId,
        durationMs: Date.now() - startTime,
      };

      state.lastCategoryIndex = selected.categoryIndex;
      state.lastScheduledAt = Date.now();
      state.totalCycles++;
      state.failedCycles++;
      state.consecutiveFailures++;
      state.recentTopics.unshift(cycleRecord);
      await this.saveState(state);

      await this.incidentManager.recordIncident({
        component: 'Scheduler:IntelligentWorker',
        severity: 'high',
        error: `Scheduled cycle pipeline failure: ${errorMsg}`,
        context: { cycleId, topic: selected.topic, correlationId },
      });

      await this.orchestrator.publish('scheduler.cycle_failed', cycleRecord, correlationId);

      return {
        success: false,
        topic: selected.topic,
        category: selected.cluster.name,
        cycleRecord,
        error: errorMsg,
      };
    }
  }

  /**
   * Retrieves comprehensive telemetry and status for the intelligent scheduler
   */
  public async getStatus(): Promise<SchedulerStatus> {
    const state = await this.getState();
    const avoidanceTopics = await this.getAvoidanceTopicsList();

    const activeIdx = state.lastCategoryIndex >= 0 ? state.lastCategoryIndex % this.clusters.length : 0;
    const nextIdx = (activeIdx + 1) % this.clusters.length;

    return {
      activeCategory: this.clusters[activeIdx]?.name || 'Autonomous Agents',
      nextCategory: this.clusters[nextIdx]?.name || 'Edge LLM Inference',
      totalClusters: this.clusters.length,
      totalCycles: state.totalCycles,
      successfulCycles: state.successfulCycles,
      failedCycles: state.failedCycles,
      lastScheduledAt: state.lastScheduledAt,
      recentCycles: state.recentTopics.slice(0, 10),
      avoidedTopicsCount: avoidanceTopics.length,
      clusters: this.clusters.map((c) => ({
        id: c.id,
        name: c.name,
        topicCount: c.topics.length,
      })),
    };
  }
}
