/**
 * Autonomous Telegram Channel Manager - Candidate System
 *
 * Captures, stores, and manages generated shadow-mode candidates.
 * Preserves candidate posts, topics, fact-checking verifications, and
 * approval/rejection outcomes for historical inspection without publishing to Telegram.
 */

import { IStorage, ShadowCandidate } from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('CandidateManager');

export interface RecordCandidateInput {
  contentId?: string;
  topic: string;
  draftText: string;
  suggestedTags?: string[];
  sources?: string[];
  status: 'approved' | 'rejected';
  rejectionReason?: string;
  confidenceScore?: number;
  claimsVerified?: Array<{ claim: string; verified: boolean; citation?: string }>;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export class CandidateManager {
  private storage: IStorage;
  private readonly storagePrefix = 'candidate:';
  private inMemoryCandidates: ShadowCandidate[] = [];

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Record a new shadow candidate with deduplication safeguards
   */
  public async recordCandidate(input: RecordCandidateInput): Promise<ShadowCandidate> {
    // Check for duplicate candidate within recent records
    const isDup = this.isDuplicate(input.topic, input.draftText);
    if (isDup) {
      logger.warn('duplicate_candidate_skipped', `Candidate for topic "${input.topic}" matches a recent candidate. Skipping duplicate write.`, {
        context: { existingId: isDup.id, topic: input.topic },
      });
      return isDup;
    }

    const id = input.contentId || `cand_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const candidate: ShadowCandidate = {
      id,
      topic: input.topic,
      draftText: input.draftText,
      suggestedTags: input.suggestedTags || [],
      sources: input.sources || [],
      status: input.status,
      rejectionReason: input.rejectionReason,
      confidenceScore: input.confidenceScore,
      claimsVerified: input.claimsVerified || [],
      correlationId: input.correlationId,
      timestamp: Date.now(),
      metadata: input.metadata,
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
   * List recent shadow candidates
   */
  public async listCandidates(limit = 20, filterStatus?: 'approved' | 'rejected'): Promise<ShadowCandidate[]> {
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
  public async getCandidateStats(): Promise<{ total: number; approved: number; rejected: number }> {
    const candidates = await this.listCandidates(100);
    return {
      total: candidates.length,
      approved: candidates.filter((c) => c.status === 'approved').length,
      rejected: candidates.filter((c) => c.status === 'rejected').length,
    };
  }
}
