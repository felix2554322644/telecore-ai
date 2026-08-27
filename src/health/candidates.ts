/**
 * Autonomous Telegram Channel Manager - Candidate System
 *
 * Phase 9: Quality Scoring, Duplicate/Similarity Detection & Fact-Checked Selection
 * Captures, scores, filters, and retains high-quality shadow-mode candidates.
 * Preserves candidate posts, topics, fact-checking verifications, and
 * approval/rejection outcomes for historical inspection without publishing to Telegram.
 */

import { IStorage, QualityBreakdown, ShadowCandidate } from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('CandidateManager');

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'about', 'into', 'over', 'after', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'how', 'what', 'why',
]);

export interface RecordCandidateInput {
  contentId?: string;
  topic: string;
  draftText: string;
  suggestedTags?: string[];
  sources?: string[];
  status: 'approved' | 'rejected';
  rejectionReason?: string;
  rejectionCode?: string;
  confidenceScore?: number;
  qualityScore?: number;
  qualityBreakdown?: QualityBreakdown;
  claimsVerified?: Array<{ claim: string; verified: boolean; citation?: string }>;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface SimilarityMatch {
  match: ShadowCandidate;
  topicSimilarity: number;
  textSimilarity: number;
}

export class CandidateManager {
  private storage: IStorage;
  private readonly storagePrefix = 'candidate:';
  private inMemoryCandidates: ShadowCandidate[] = [];

  // Configurable thresholds
  public readonly minConfidenceThreshold = 0.80;
  public readonly minQualityThreshold = 0.75;
  public readonly topicSimilarityThreshold = 0.75;
  public readonly textSimilarityThreshold = 0.70;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Tokenize text into normalized significant words
   */
  public tokenize(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
    return new Set(words);
  }

  /**
   * Compute Jaccard token similarity between two texts (0.0 to 1.0)
   */
  public computeTokenSimilarity(textA: string, textB: string): number {
    const tokensA = this.tokenize(textA);
    const tokensB = this.tokenize(textB);

    if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
    if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

    let intersectionCount = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) {
        intersectionCount++;
      }
    }

    const unionCount = tokensA.size + tokensB.size - intersectionCount;
    return unionCount > 0 ? Number((intersectionCount / unionCount).toFixed(3)) : 0;
  }

  /**
   * Compute Character N-gram (tri-gram) similarity for fuzzy phrase matching
   */
  public computeNgramSimilarity(strA: string, strB: string, n = 3): number {
    const cleanA = strA.toLowerCase().replace(/\s+/g, ' ').trim();
    const cleanB = strB.toLowerCase().replace(/\s+/g, ' ').trim();

    if (cleanA === cleanB) return 1.0;
    if (cleanA.length < n || cleanB.length < n) return 0.0;

    const getNgrams = (s: string) => {
      const set = new Set<string>();
      for (let i = 0; i <= s.length - n; i++) {
        set.add(s.substring(i, i + n));
      }
      return set;
    };

    const ngramsA = getNgrams(cleanA);
    const ngramsB = getNgrams(cleanB);

    let matchCount = 0;
    for (const ng of ngramsA) {
      if (ngramsB.has(ng)) matchCount++;
    }

    const total = ngramsA.size + ngramsB.size - matchCount;
    return total > 0 ? Number((matchCount / total).toFixed(3)) : 0;
  }

  /**
   * Find if a candidate with similar topic or content already exists in recent history
   */
  public findSimilarCandidate(
    topic: string,
    draftText: string,
    topicThreshold = this.topicSimilarityThreshold,
    textThreshold = this.textSimilarityThreshold
  ): SimilarityMatch | null {
    for (const existing of this.inMemoryCandidates) {
      const topicTokenSim = this.computeTokenSimilarity(topic, existing.topic);
      const topicNgramSim = this.computeNgramSimilarity(topic, existing.topic);
      const topicSim = Number(Math.max(topicTokenSim, topicNgramSim).toFixed(3));

      const textTokenSim = this.computeTokenSimilarity(draftText, existing.draftText);
      const textNgramSim = this.computeNgramSimilarity(draftText, existing.draftText);
      const textSim = Number(Math.max(textTokenSim, textNgramSim).toFixed(3));

      // Match if:
      // 1. High topic similarity (>= threshold) AND at least moderate text similarity (>= 0.25)
      // 2. Near-identical topic (>= 0.85)
      // 3. Duplicate text content (>= textThreshold)
      const isSimilarTopic = (topicSim >= topicThreshold && textSim >= 0.25) || topicSim >= 0.85;
      const isSimilarText = textSim >= textThreshold;

      if (isSimilarTopic || isSimilarText) {
        return {
          match: existing,
          topicSimilarity: topicSim,
          textSimilarity: textSim,
        };
      }
    }

    return null;
  }

  /**
   * Record a new shadow candidate with quality scoring, similarity detection, and deduplication
   */
  public async recordCandidate(input: RecordCandidateInput): Promise<ShadowCandidate> {
    // 1. Check for exact duplicate candidate within recent memory
    const exactDup = this.isDuplicate(input.topic, input.draftText);
    if (exactDup) {
      logger.warn('duplicate_candidate_skipped', `Candidate for topic "${input.topic}" matches a recent candidate. Skipping duplicate write.`, {
        context: { existingId: exactDup.id, topic: input.topic },
      });
      return exactDup;
    }

    let finalStatus = input.status;
    let finalRejectionReason = input.rejectionReason;
    let finalRejectionCode = input.rejectionCode;
    const metadata: Record<string, unknown> = { ...input.metadata };

    // 2. Enforce confidence threshold guard
    if (finalStatus === 'approved' && input.confidenceScore !== undefined && input.confidenceScore < this.minConfidenceThreshold) {
      finalStatus = 'rejected';
      finalRejectionCode = 'LOW_CONFIDENCE_SCORE';
      finalRejectionReason = `Rejected: Confidence score (${input.confidenceScore}) is below minimum threshold (${this.minConfidenceThreshold}).`;
      logger.info('candidate_downgraded_confidence', `Candidate for "${input.topic}" downgraded to rejected due to low confidence`, {
        context: { confidenceScore: input.confidenceScore, threshold: this.minConfidenceThreshold },
      });
    }

    // 3. Enforce quality score threshold guard
    if (finalStatus === 'approved' && input.qualityScore !== undefined && input.qualityScore < this.minQualityThreshold) {
      finalStatus = 'rejected';
      finalRejectionCode = 'LOW_QUALITY_SCORE';
      finalRejectionReason = `Rejected: Quality score (${input.qualityScore}) is below minimum threshold (${this.minQualityThreshold}).`;
      logger.info('candidate_downgraded_quality', `Candidate for "${input.topic}" downgraded to rejected due to low quality`, {
        context: { qualityScore: input.qualityScore, threshold: this.minQualityThreshold },
      });
    }

    // 4. Topic and content similarity detection guard for approved posts
    if (finalStatus === 'approved') {
      const similar = this.findSimilarCandidate(input.topic, input.draftText);
      if (similar) {
        finalStatus = 'rejected';
        finalRejectionCode = 'DUPLICATE_TOPIC_SIMILARITY';
        finalRejectionReason = `Rejected as duplicate: ${Math.round(similar.topicSimilarity * 100)}% topic similarity with recent candidate "${similar.match.topic}" (ID: ${similar.match.id}).`;
        metadata.similarityMatch = {
          candidateId: similar.match.id,
          topic: similar.match.topic,
          topicSimilarity: similar.topicSimilarity,
          textSimilarity: similar.textSimilarity,
        };
        logger.info('candidate_rejected_similarity', `Candidate for "${input.topic}" rejected due to similarity with ${similar.match.id}`, {
          context: {
            topic: input.topic,
            matchedTopic: similar.match.topic,
            topicSimilarity: similar.topicSimilarity,
          },
        });
      }
    }

    const id = input.contentId || `cand_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const candidate: ShadowCandidate = {
      id,
      topic: input.topic,
      draftText: input.draftText,
      suggestedTags: input.suggestedTags || [],
      sources: input.sources || [],
      status: finalStatus,
      rejectionReason: finalRejectionReason,
      rejectionCode: finalRejectionCode,
      confidenceScore: input.confidenceScore,
      qualityScore: input.qualityScore,
      qualityBreakdown: input.qualityBreakdown,
      claimsVerified: input.claimsVerified || [],
      correlationId: input.correlationId,
      timestamp: Date.now(),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    this.inMemoryCandidates.unshift(candidate);
    if (this.inMemoryCandidates.length > 100) {
      this.inMemoryCandidates.pop();
    }

    try {
      await this.storage.set(`${this.storagePrefix}${id}`, candidate, {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
      });
    } catch (err) {
      logger.error('candidate_storage_failed', `Failed to persist candidate ${id} in storage`, {
        error: err,
      });
    }

    logger.info('candidate_recorded', `Shadow candidate ${id} [${candidate.status.toUpperCase()}] recorded for topic: ${candidate.topic}`, {
      correlationId: candidate.correlationId,
      context: {
        candidateId: id,
        status: candidate.status,
        confidenceScore: candidate.confidenceScore,
        qualityScore: candidate.qualityScore,
        rejectionCode: candidate.rejectionCode,
      },
    });

    return candidate;
  }

  /**
   * Check if a candidate with identical normalized topic and text already exists
   */
  public isDuplicate(topic: string, draftText: string): ShadowCandidate | null {
    const normTopic = topic.trim().toLowerCase();
    const normText = draftText.trim().toLowerCase();
    const existing = this.inMemoryCandidates.find(
      (c) => c.topic.trim().toLowerCase() === normTopic && c.draftText.trim().toLowerCase() === normText
    );
    return existing || null;
  }

  /**
   * Retrieve a specific candidate by ID
   */
  public async getCandidate(id: string): Promise<ShadowCandidate | null> {
    const memoryMatch = this.inMemoryCandidates.find((cand) => cand.id === id);
    if (memoryMatch) return memoryMatch;

    return this.storage.get<ShadowCandidate>(`${this.storagePrefix}${id}`);
  }

  /**
   * Check if a candidate has already been published to prevent duplicate replay transmissions
   */
  public async isCandidatePublished(id: string): Promise<boolean> {
    const cand = await this.getCandidate(id);
    if (!cand) return false;
    return cand.status === 'published' || Boolean(cand.publishedAt) || Boolean(cand.publishedMessageId);
  }

  /**
   * Mark an approved shadow candidate as published with full audit metadata and anti-replay markers
   */
  public async markCandidatePublished(
    id: string,
    publishDetails: {
      messageId: number;
      channelId: string;
      publishedAt?: number;
      publishedBy?: string;
      correlationId?: string;
    }
  ): Promise<ShadowCandidate | null> {
    const candidate = await this.getCandidate(id);
    if (!candidate) {
      logger.warn('mark_published_not_found', `Candidate ${id} not found for marking published`);
      return null;
    }

    const publishedAt = publishDetails.publishedAt || Date.now();
    candidate.status = 'published';
    candidate.publishedAt = publishedAt;
    candidate.publishedMessageId = publishDetails.messageId;
    candidate.publishedChannelId = publishDetails.channelId;
    candidate.metadata = {
      ...(candidate.metadata || {}),
      publishedAt,
      publishedMessageId: publishDetails.messageId,
      publishedChannelId: publishDetails.channelId,
      publishedBy: publishDetails.publishedBy || 'owner:admin',
      publishCorrelationId: publishDetails.correlationId,
    };

    // Update in-memory pool
    const memoryIdx = this.inMemoryCandidates.findIndex((c) => c.id === id);
    if (memoryIdx !== -1) {
      this.inMemoryCandidates[memoryIdx] = candidate;
    } else {
      this.inMemoryCandidates.unshift(candidate);
    }

    // Persist to storage
    try {
      await this.storage.set(`${this.storagePrefix}${id}`, candidate, {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
      });
    } catch (err) {
      logger.error('candidate_published_storage_failed', `Failed to persist published state for candidate ${id}`, {
        error: err,
      });
    }

    logger.info('candidate_marked_published', `Candidate ${id} marked as PUBLISHED (messageId: ${publishDetails.messageId}, channel: ${publishDetails.channelId})`, {
      correlationId: publishDetails.correlationId,
      context: {
        candidateId: id,
        messageId: publishDetails.messageId,
        channelId: publishDetails.channelId,
        publishedAt,
      },
    });

    return candidate;
  }

  /**
   * List recent shadow candidates with optional status filter
   */
  public async listCandidates(
    limit = 20,
    filterStatus?: 'approved' | 'rejected' | 'published'
  ): Promise<ShadowCandidate[]> {
    let pool = [...this.inMemoryCandidates];

    if (pool.length < limit) {
      try {
        const keys = await this.storage.list(this.storagePrefix);
        for (const key of keys.slice(0, limit)) {
          if (!pool.some((c) => `${this.storagePrefix}${c.id}` === key)) {
            const cand = await this.storage.get<ShadowCandidate>(key);
            if (cand) pool.push(cand);
          }
        }
      } catch (err) {
        logger.error('candidate_list_failed', 'Failed to list candidates from storage', { error: err });
      }
    }

    if (filterStatus) {
      pool = pool.filter((c) => c.status === filterStatus);
    }

    // Sort newest first
    pool.sort((a, b) => b.timestamp - a.timestamp);
    return pool.slice(0, limit);
  }

  /**
   * Aggregate candidate metrics
   */
  public async getCandidateStats(): Promise<{
    total: number;
    approved: number;
    rejected: number;
    published: number;
    avgQualityScore?: number;
    avgConfidenceScore?: number;
  }> {
    const candidates = await this.listCandidates(100);
    const approved = candidates.filter((c) => c.status === 'approved');
    const rejected = candidates.filter((c) => c.status === 'rejected');
    const published = candidates.filter((c) => c.status === 'published');

    const qualityScores = candidates
      .map((c) => c.qualityScore)
      .filter((s): s is number => typeof s === 'number' && !isNaN(s));
    const confidenceScores = candidates
      .map((c) => c.confidenceScore)
      .filter((s): s is number => typeof s === 'number' && !isNaN(s));

    const avgQualityScore =
      qualityScores.length > 0
        ? Number((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(2))
        : undefined;

    const avgConfidenceScore =
      confidenceScores.length > 0
        ? Number((confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length).toFixed(2))
        : undefined;

    return {
      total: candidates.length,
      approved: approved.length,
      rejected: rejected.length,
      published: published.length,
      avgQualityScore,
      avgConfidenceScore,
    };
  }
}

