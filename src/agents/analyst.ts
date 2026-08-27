/**
 * Autonomous Telegram Channel Manager - Analyst Agent
 *
 * Phase 11: Feedback & Learning Loop
 * - Aggregates stored candidate results (quality scores, confidence, approvals, rejections).
 * - Tracks which topic clusters, content characteristics, tags, and formatting styles perform best.
 * - Computes adaptive learned weights per cluster to dynamically influence future scheduler topic selection.
 * - Emits analytical feedback reports and actionable content recommendations without publishing to Telegram.
 */

import { CandidateManager } from '../health/candidates.ts';
import { DEFAULT_TOPIC_CLUSTERS } from '../scheduler/intelligentScheduler.ts';
import {
  AgentExecutionResult,
  AgentMetadata,
  BaseEvent,
  ClusterPerformanceMetrics,
  ContentCharacteristicMetrics,
  FeedbackLearningReport,
  IAgent,
  IStorage,
  QualityBreakdown,
  ShadowCandidate,
  TopicCluster,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('Agent:Analyst');

export interface ChannelPerformanceMetrics {
  totalPublished: number;
  periodStart: number;
  periodEnd: number;
  topPerformingTopics: string[];
  summaryNote: string;
  feedbackReport?: FeedbackLearningReport;
}

export class AnalystAgent implements IAgent<{ channelId?: string; refreshFeedback?: boolean }, ChannelPerformanceMetrics> {
  public readonly metadata: AgentMetadata = {
    name: 'AnalystAgent',
    role: 'analyst',
    version: '0.2.0-feedback-learning',
    description: 'Analyzes stored candidate evaluations, quality dimensions, cluster performance, and feedback loops.',
    isAutonomous: false,
    status: 'ready',
  };

  private storage?: IStorage;
  private candidateManager?: CandidateManager;
  private clusters: TopicCluster[];
  private readonly feedbackReportStorageKey = 'analytics:feedback_report';
  private readonly clusterWeightsStorageKey = 'analytics:cluster_weights';

  constructor(storage?: IStorage, candidateManager?: CandidateManager, customClusters?: TopicCluster[]) {
    this.storage = storage;
    this.candidateManager = candidateManager;
    this.clusters = customClusters && customClusters.length > 0 ? customClusters : DEFAULT_TOPIC_CLUSTERS;
  }

  public canHandle(event: BaseEvent): boolean {
    return (
      event.type === 'content.published' ||
      event.type === 'candidate.recorded' ||
      event.type === 'content.rejected' ||
      event.type === 'scheduler.cycle_completed'
    );
  }

  /**
   * Matches a candidate's topic/tags/metadata to the closest topic cluster
   */
  public matchClusterForCandidate(candidate: ShadowCandidate): TopicCluster {
    // 1. Direct metadata match
    if (candidate.metadata?.clusterId) {
      const match = this.clusters.find((c) => c.id === candidate.metadata?.clusterId);
      if (match) return match;
    }

    const candTopic = candidate.topic.toLowerCase();

    // 2. Exact or substring match in cluster topics
    for (const cluster of this.clusters) {
      for (const t of cluster.topics) {
        if (candTopic.includes(t.toLowerCase()) || t.toLowerCase().includes(candTopic)) {
          return cluster;
        }
      }
    }

    // 3. Keyword / token overlap matching
    let bestCluster = this.clusters[0];
    let highestScore = -1;

    const candTokens = candTopic.replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);

    for (const cluster of this.clusters) {
      let score = 0;
      const clusterText = `${cluster.name} ${cluster.description} ${cluster.topics.join(' ')}`.toLowerCase();

      for (const token of candTokens) {
        if (clusterText.includes(token)) {
          score += 1;
        }
      }

      // Check tags
      for (const tag of candidate.suggestedTags || []) {
        if (clusterText.includes(tag.toLowerCase())) {
          score += 1.5;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestCluster = cluster;
      }
    }

    return bestCluster;
  }

  /**
   * Generates a comprehensive feedback and learning report from stored candidates
   */
  public async generateFeedbackReport(limit = 100): Promise<FeedbackLearningReport> {
    const startTime = Date.now();
    logger.info('feedback_analysis_started', 'Generating feedback & learning report from candidate evaluations', {
      context: { candidateLimit: limit },
    });

    let candidates: ShadowCandidate[] = [];
    if (this.candidateManager) {
      candidates = await this.candidateManager.listCandidates(limit);
    }

    const defaultQualityBreakdown: QualityBreakdown = {
      factualAccuracy: 0.90,
      technicalDepth: 0.88,
      actionableUtility: 0.86,
      clarityAndTone: 0.92,
      sourceGrounding: 0.85,
    };

    // Initialize cluster performance map
    const clusterMap: Record<string, ClusterPerformanceMetrics> = {};
    for (const cluster of this.clusters) {
      clusterMap[cluster.id] = {
        clusterId: cluster.id,
        clusterName: cluster.name,
        totalGenerated: 0,
        approvedCount: 0,
        rejectedCount: 0,
        approvalRate: 1.0,
        avgQualityScore: 0.88,
        avgConfidenceScore: 0.90,
        qualityBreakdownAvg: { ...defaultQualityBreakdown },
        commonRejectionCodes: [],
        learnedWeight: 1.0,
        sampleCount: 0,
        lastEvaluatedAt: startTime,
      };
    }

    // Accumulators for cluster aggregations
    const clusterStats: Record<
      string,
      {
        total: number;
        approved: number;
        rejected: number;
        qualityScores: number[];
        confidenceScores: number[];
        qualityBreakdowns: QualityBreakdown[];
        rejectionCodes: Record<string, number>;
      }
    > = {};

    for (const cluster of this.clusters) {
      clusterStats[cluster.id] = {
        total: 0,
        approved: 0,
        rejected: 0,
        qualityScores: [],
        confidenceScores: [],
        qualityBreakdowns: [],
        rejectionCodes: {},
      };
    }

    // Content characteristic accumulators
    const approvedWordCounts: number[] = [];
    const approvedCharCounts: number[] = [];
    const rejectedWordCounts: number[] = [];
    const rejectedCharCounts: number[] = [];
    const sourcesCounts: number[] = [];
    const tagsCounts: number[] = [];
    const tagStats: Record<string, { total: number; approved: number }> = {};
    let totalClaims = 0;
    let verifiedClaims = 0;
    const highScoringTopics: Array<{ topic: string; qualityScore: number; clusterName?: string }> = [];

    for (const cand of candidates) {
      const cluster = this.matchClusterForCandidate(cand);
      const cStat = clusterStats[cluster.id] || clusterStats[this.clusters[0].id];

      cStat.total++;
      if (cand.status === 'approved') {
        cStat.approved++;
      } else {
        cStat.rejected++;
        if (cand.rejectionCode) {
          cStat.rejectionCodes[cand.rejectionCode] = (cStat.rejectionCodes[cand.rejectionCode] || 0) + 1;
        }
      }

      if (typeof cand.qualityScore === 'number' && !isNaN(cand.qualityScore)) {
        cStat.qualityScores.push(cand.qualityScore);
      }
      if (typeof cand.confidenceScore === 'number' && !isNaN(cand.confidenceScore)) {
        cStat.confidenceScores.push(cand.confidenceScore);
      }
      if (cand.qualityBreakdown) {
        cStat.qualityBreakdowns.push(cand.qualityBreakdown);
      }

      // Content characteristics
      const words = cand.draftText.trim().split(/\s+/).filter(Boolean).length;
      const chars = cand.draftText.length;

      if (cand.status === 'approved') {
        approvedWordCounts.push(words);
        approvedCharCounts.push(chars);
        if (typeof cand.qualityScore === 'number' && cand.qualityScore >= 0.85) {
          highScoringTopics.push({
            topic: cand.topic,
            qualityScore: cand.qualityScore,
            clusterName: cluster.name,
          });
        }
      } else {
        rejectedWordCounts.push(words);
        rejectedCharCounts.push(chars);
      }

      sourcesCounts.push(cand.sources?.length || 0);
      tagsCounts.push(cand.suggestedTags?.length || 0);

      // Track tags
      for (const tag of cand.suggestedTags || []) {
        const normTag = tag.trim().toLowerCase();
        if (!tagStats[normTag]) {
          tagStats[normTag] = { total: 0, approved: 0 };
        }
        tagStats[normTag].total++;
        if (cand.status === 'approved') {
          tagStats[normTag].approved++;
        }
      }

      // Track claims
      for (const claim of cand.claimsVerified || []) {
        totalClaims++;
        if (claim.verified) verifiedClaims++;
      }
    }

    // Compute metrics for each cluster
    const clusterWeightsRecord: Record<string, number> = {};

    for (const cluster of this.clusters) {
      const stats = clusterStats[cluster.id];
      const sampleCount = stats.total;

      const approvedCount = stats.approved;
      const rejectedCount = stats.rejected;
      const approvalRate = sampleCount > 0 ? Number((approvedCount / sampleCount).toFixed(3)) : 1.0;

      const avgQualityScore =
        stats.qualityScores.length > 0
          ? Number((stats.qualityScores.reduce((a, b) => a + b, 0) / stats.qualityScores.length).toFixed(3))
          : 0.88;

      const avgConfidenceScore =
        stats.confidenceScores.length > 0
          ? Number((stats.confidenceScores.reduce((a, b) => a + b, 0) / stats.confidenceScores.length).toFixed(3))
          : 0.90;

      // Quality breakdown averages
      const qbAvg: QualityBreakdown = { ...defaultQualityBreakdown };
      if (stats.qualityBreakdowns.length > 0) {
        const len = stats.qualityBreakdowns.length;
        qbAvg.factualAccuracy = Number((stats.qualityBreakdowns.reduce((a, b) => a + b.factualAccuracy, 0) / len).toFixed(3));
        qbAvg.technicalDepth = Number((stats.qualityBreakdowns.reduce((a, b) => a + b.technicalDepth, 0) / len).toFixed(3));
        qbAvg.actionableUtility = Number((stats.qualityBreakdowns.reduce((a, b) => a + b.actionableUtility, 0) / len).toFixed(3));
        qbAvg.clarityAndTone = Number((stats.qualityBreakdowns.reduce((a, b) => a + b.clarityAndTone, 0) / len).toFixed(3));
        qbAvg.sourceGrounding = Number((stats.qualityBreakdowns.reduce((a, b) => a + b.sourceGrounding, 0) / len).toFixed(3));
      }

      // Sort common rejection codes
      const commonRejectionCodes = Object.entries(stats.rejectionCodes)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);

      // Dynamic Learned Weight Formula:
      // Base = 1.0
      // + Quality impact: (avgQualityScore - 0.80) * 2.0
      // + Approval impact: (approvalRate - 0.70) * 1.5
      // + Exploration bonus if under-sampled (< 3 samples): + 0.30
      // - Frequent duplicate penalty if rejection code is DUPLICATE_TOPIC_SIMILARITY: -0.25
      let weight = 1.0;
      if (sampleCount > 0) {
        weight += (avgQualityScore - 0.80) * 2.0;
        weight += (approvalRate - 0.70) * 1.5;

        if (stats.rejectionCodes['DUPLICATE_TOPIC_SIMILARITY'] && stats.rejectionCodes['DUPLICATE_TOPIC_SIMILARITY'] > 1) {
          weight -= 0.25;
        }
      } else {
        // Exploration bonus for unobserved clusters
        weight += 0.25;
      }

      // Clamp weight within [0.35, 2.50]
      const learnedWeight = Number(Math.max(0.35, Math.min(2.50, weight)).toFixed(2));
      clusterWeightsRecord[cluster.id] = learnedWeight;

      clusterMap[cluster.id] = {
        clusterId: cluster.id,
        clusterName: cluster.name,
        totalGenerated: sampleCount,
        approvedCount,
        rejectedCount,
        approvalRate,
        avgQualityScore,
        avgConfidenceScore,
        qualityBreakdownAvg: qbAvg,
        commonRejectionCodes,
        learnedWeight,
        sampleCount,
        lastEvaluatedAt: startTime,
      };
    }

    // Content characteristic statistics
    const avgApprWords = approvedWordCounts.length > 0 ? Math.round(approvedWordCounts.reduce((a, b) => a + b, 0) / approvedWordCounts.length) : 120;
    const avgApprChars = approvedCharCounts.length > 0 ? Math.round(approvedCharCounts.reduce((a, b) => a + b, 0) / approvedCharCounts.length) : 750;
    const minWords = approvedWordCounts.length > 0 ? Math.min(...approvedWordCounts) : 60;
    const maxWords = approvedWordCounts.length > 0 ? Math.max(...approvedWordCounts) : 220;

    const avgRejWords = rejectedWordCounts.length > 0 ? Math.round(rejectedWordCounts.reduce((a, b) => a + b, 0) / rejectedWordCounts.length) : 95;
    const avgRejChars = rejectedCharCounts.length > 0 ? Math.round(rejectedCharCounts.reduce((a, b) => a + b, 0) / rejectedCharCounts.length) : 600;

    const avgSources = sourcesCounts.length > 0 ? Number((sourcesCounts.reduce((a, b) => a + b, 0) / sourcesCounts.length).toFixed(1)) : 2.0;
    const avgTags = tagsCounts.length > 0 ? Number((tagsCounts.reduce((a, b) => a + b, 0) / tagsCounts.length).toFixed(1)) : 3.0;

    const topPerformingTags = Object.entries(tagStats)
      .map(([tag, st]) => ({
        tag,
        count: st.total,
        approvalRate: st.total > 0 ? Number((st.approved / st.total).toFixed(2)) : 1.0,
      }))
      .filter((t) => t.count >= 1)
      .sort((a, b) => b.approvalRate - a.approvalRate || b.count - a.count)
      .slice(0, 10);

    const claimVerificationRate = totalClaims > 0 ? Number((verifiedClaims / totalClaims).toFixed(2)) : 0.95;

    const contentCharacteristics: ContentCharacteristicMetrics = {
      approvedLengthStats: {
        avgCharCount: avgApprChars,
        avgWordCount: avgApprWords,
        minWordCount: minWords,
        maxWordCount: maxWords,
      },
      rejectedLengthStats: {
        avgCharCount: avgRejChars,
        avgWordCount: avgRejWords,
      },
      optimalWordRange: {
        min: Math.max(50, minWords),
        max: Math.min(300, maxWords),
      },
      avgSourcesCount: avgSources,
      avgTagsCount: avgTags,
      topPerformingTags,
      claimVerificationRate,
      highScoringTopics: highScoringTopics.slice(0, 10),
    };

    // Sort clusters by performance
    const clusterEntries = Object.values(clusterMap);
    const sortedByWeight = [...clusterEntries].sort((a, b) => b.learnedWeight - a.learnedWeight);

    const topPerformingClusters = sortedByWeight.filter((c) => c.learnedWeight >= 1.1).map((c) => c.clusterName);
    const underperformingClusters = sortedByWeight.filter((c) => c.learnedWeight < 0.85).map((c) => c.clusterName);

    // Formulate actionable recommendations
    const recommendations: string[] = [];
    if (topPerformingClusters.length > 0) {
      recommendations.push(
        `Prioritize topics from high-performing cluster(s): ${topPerformingClusters.slice(0, 2).join(', ')} (learned weight >= 1.1x).`
      );
    }
    if (underperformingClusters.length > 0) {
      recommendations.push(
        `Cooldown or diversify subtopics in cluster(s) with high rejection/similarity rates: ${underperformingClusters.slice(0, 2).join(', ')}.`
      );
    }
    if (avgSources < 1.5) {
      recommendations.push('Incentivize >= 2 authoritative source citations during research to improve factual verification confidence.');
    } else {
      recommendations.push(`Maintain grounded source citation density (current average: ${avgSources} sources per draft).`);
    }
    recommendations.push(
      `Target optimal post length of ${contentCharacteristics.optimalWordRange.min}–${contentCharacteristics.optimalWordRange.max} words for maximum quality score compliance.`
    );

    const totalEvaluated = candidates.length;
    const totalApproved = candidates.filter((c) => c.status === 'approved').length;
    const overallApprovalRate = totalEvaluated > 0 ? Number((totalApproved / totalEvaluated).toFixed(3)) : 1.0;

    const allQualityScores = candidates
      .map((c) => c.qualityScore)
      .filter((s): s is number => typeof s === 'number' && !isNaN(s));
    const overallAvgQuality =
      allQualityScores.length > 0
        ? Number((allQualityScores.reduce((a, b) => a + b, 0) / allQualityScores.length).toFixed(3))
        : 0.89;

    const report: FeedbackLearningReport = {
      generatedAt: startTime,
      totalEvaluatedCandidates: totalEvaluated,
      overallApprovalRate,
      overallAvgQuality,
      clusterPerformance: clusterMap,
      contentCharacteristics,
      topPerformingClusters: topPerformingClusters.length > 0 ? topPerformingClusters : [this.clusters[0].name],
      underperformingClusters,
      recommendations,
    };

    // Persist report and weights to storage if storage is available
    if (this.storage) {
      try {
        await this.storage.set(this.feedbackReportStorageKey, report, {
          expirationTtl: 30 * 24 * 60 * 60, // 30 days
        });
        await this.storage.set(this.clusterWeightsStorageKey, clusterWeightsRecord, {
          expirationTtl: 30 * 24 * 60 * 60,
        });
      } catch (err) {
        logger.warn('feedback_report_storage_failed', 'Failed to store feedback report in storage', { error: err });
      }
    }

    logger.info('feedback_analysis_completed', `Feedback report generated from ${totalEvaluated} candidates across ${this.clusters.length} clusters`, {
      context: {
        totalEvaluated,
        overallApprovalRate,
        overallAvgQuality,
        topCluster: sortedByWeight[0]?.clusterName,
      },
    });

    return report;
  }

  /**
   * Retrieves the latest feedback report from storage or generates a fresh one
   */
  public async getFeedbackReport(): Promise<FeedbackLearningReport> {
    if (this.storage) {
      try {
        const cached = await this.storage.get<FeedbackLearningReport>(this.feedbackReportStorageKey);
        if (cached && Date.now() - cached.generatedAt < 10 * 60 * 1000) {
          return cached;
        }
      } catch {
        // Fallback to fresh generation
      }
    }
    return this.generateFeedbackReport();
  }

  /**
   * Retrieves current learned cluster weights for scheduler topic selection
   */
  public async getClusterWeights(): Promise<Record<string, number>> {
    if (this.storage) {
      try {
        const cached = await this.storage.get<Record<string, number>>(this.clusterWeightsStorageKey);
        if (cached && Object.keys(cached).length > 0) {
          return cached;
        }
      } catch {
        // Fallback
      }
    }

    const report = await this.getFeedbackReport();
    const weights: Record<string, number> = {};
    for (const [id, perf] of Object.entries(report.clusterPerformance)) {
      weights[id] = perf.learnedWeight;
    }
    return weights;
  }

  public async execute(
    input: { channelId?: string; refreshFeedback?: boolean },
    correlationId?: string
  ): Promise<AgentExecutionResult<ChannelPerformanceMetrics>> {
    const startTime = Date.now();
    const channel = input.channelId || '@techpluseai';
    logger.info('analysis_started', `Analyzing metrics and feedback loop for channel: ${channel}`, { correlationId });

    const feedbackReport = await this.generateFeedbackReport();

    const topTopics = feedbackReport.contentCharacteristics.highScoringTopics.map((t) => t.topic).slice(0, 5);

    const metrics: ChannelPerformanceMetrics = {
      totalPublished: feedbackReport.totalEvaluatedCandidates,
      periodStart: Date.now() - 30 * 24 * 60 * 60 * 1000,
      periodEnd: Date.now(),
      topPerformingTopics: topTopics.length > 0 ? topTopics : ['Autonomous Agent Architectures', 'Edge LLM Inference'],
      summaryNote: `Feedback learning active. Evaluated ${feedbackReport.totalEvaluatedCandidates} candidates. Top cluster: ${feedbackReport.topPerformingClusters[0] || 'Autonomous Agents'}.`,
      feedbackReport,
    };

    return {
      success: true,
      data: metrics,
      durationMs: Date.now() - startTime,
      metadata: {
        overallApprovalRate: feedbackReport.overallApprovalRate,
        overallAvgQuality: feedbackReport.overallAvgQuality,
        topClusters: feedbackReport.topPerformingClusters,
      },
    };
  }
}
