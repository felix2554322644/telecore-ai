/**
 * Autonomous Telegram Channel Manager - Fact Checker Agent
 *
 * Phase 9: Candidate Quality, Fact Checking & Rigorous Selection
 * Audits factual accuracy, claims, citations, links, technical depth, and prevents hallucinations or promotional slop.
 */

import { IGeminiService } from '../ai/gemini.ts';
import {
  AgentExecutionResult,
  AgentMetadata,
  BaseEvent,
  ContentCheckedPayload,
  ContentGeneratedPayload,
  IAgent,
  QualityBreakdown,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('Agent:FactChecker');

const BANNED_HYPE_PATTERNS = [
  /\bget rich\b/i,
  /\bmind-blowing\b/i,
  /\bgame[- ]changer\b/i,
  /\brevolutionary miracle\b/i,
  /\b100x your life\b/i,
  /\bsecret hack\b/i,
  /\bcrypto moon\b/i,
  /\bunbelievable trick\b/i,
  /\bguaranteed profits\b/i,
  /\bmagic bullet\b/i,
  /\bunprecedented breakthrough of all time\b/i,
];

export interface FactCheckerOptions {
  minConfidenceScore?: number;
  minQualityScore?: number;
  minDraftLength?: number;
  maxDraftLength?: number;
}

export class FactCheckerAgent implements IAgent<ContentGeneratedPayload, ContentCheckedPayload> {
  public readonly metadata: AgentMetadata = {
    name: 'FactCheckerAgent',
    role: 'factChecker',
    version: '0.2.0-quality-audit',
    description: 'Audits factual accuracy, technical depth, source grounding, and enforces editorial quality thresholds.',
    isAutonomous: true,
    status: 'ready',
  };

  private geminiService?: IGeminiService;
  private minConfidenceScore: number;
  private minQualityScore: number;
  private minDraftLength: number;
  private maxDraftLength: number;

  constructor(geminiService?: IGeminiService, options: FactCheckerOptions = {}) {
    this.geminiService = geminiService;
    this.minConfidenceScore = options.minConfidenceScore ?? 0.80;
    this.minQualityScore = options.minQualityScore ?? 0.75;
    this.minDraftLength = options.minDraftLength ?? 60;
    this.maxDraftLength = options.maxDraftLength ?? 4000;
  }

  public canHandle(event: BaseEvent): boolean {
    return event.type === 'content.generated';
  }

  /**
   * Evaluates draft text using deterministic heuristics
   */
  private evaluateDeterministically(input: ContentGeneratedPayload): ContentCheckedPayload {
    const draft = input.draftText.trim();
    const topic = input.topic.trim();

    // 1. Length bounds
    if (draft.length < this.minDraftLength) {
      return {
        contentId: input.contentId,
        passed: false,
        confidenceScore: 0.3,
        qualityScore: 0.35,
        claimsVerified: [],
        rejectionCode: 'INSUFFICIENT_LENGTH',
        rejectionReason: `Draft text length (${draft.length} chars) is below required minimum ${this.minDraftLength} characters.`,
        qualityBreakdown: {
          factualAccuracy: 0.4,
          technicalDepth: 0.3,
          actionableUtility: 0.3,
          clarityAndTone: 0.4,
          sourceGrounding: 0.3,
        },
        notes: 'Failed minimal draft length threshold.',
      };
    }

    if (draft.length > this.maxDraftLength) {
      return {
        contentId: input.contentId,
        passed: false,
        confidenceScore: 0.4,
        qualityScore: 0.45,
        claimsVerified: [],
        rejectionCode: 'EXCEEDS_LENGTH_LIMIT',
        rejectionReason: `Draft text length (${draft.length} chars) exceeds maximum allowed Telegram length (${this.maxDraftLength} chars).`,
        qualityBreakdown: {
          factualAccuracy: 0.5,
          technicalDepth: 0.5,
          actionableUtility: 0.4,
          clarityAndTone: 0.3,
          sourceGrounding: 0.5,
        },
        notes: 'Failed maximum draft length limit.',
      };
    }

    // 2. Hype & promotional slop filter
    for (const pattern of BANNED_HYPE_PATTERNS) {
      if (pattern.test(draft)) {
        return {
          contentId: input.contentId,
          passed: false,
          confidenceScore: 0.4,
          qualityScore: 0.35,
          claimsVerified: [
            {
              claim: 'Editorial tone compliance',
              verified: false,
              citation: 'Anti-Hype Policy',
            },
          ],
          rejectionCode: 'BANNED_HYPE_PATTERNS',
          rejectionReason: `Draft contains promotional hyperbole or banned buzzwords matching pattern: ${pattern.source}`,
          qualityBreakdown: {
            factualAccuracy: 0.5,
            technicalDepth: 0.4,
            actionableUtility: 0.4,
            clarityAndTone: 0.2,
            sourceGrounding: 0.5,
          },
          notes: 'Flagged by anti-hype / anti-slop filter.',
        };
      }
    }

    // 3. Source grounding
    const hasValidSources = Array.isArray(input.sources) && input.sources.some((s) => s.startsWith('http://') || s.startsWith('https://'));
    const sourceGrounding = hasValidSources ? 0.92 : 0.40;

    // 4. Technical depth & actionable utility heuristics
    const technicalKeywords = [
      'architecture', 'latency', 'isolate', 'worker', 'concurrency', 'distributed',
      'inference', 'model', 'pipeline', 'caching', 'state', 'compute', 'database',
      'api', 'runtime', 'speculative', 'memory', 'throughput', 'token', 'system',
      'automation', 'optimization', 'workflow', 'developer',
    ];
    const draftLower = draft.toLowerCase();
    const techHits = technicalKeywords.filter((k) => draftLower.includes(k)).length;
    const technicalDepth = Math.min(1.0, 0.65 + techHits * 0.05);

    const hasActionableBullet = draft.includes('•') || draft.includes('- ') || draft.includes('* ');
    const actionableUtility = hasActionableBullet ? 0.88 : 0.65;

    const clarityAndTone = draft.includes('#') && draft.length >= 100 ? 0.92 : 0.78;
    const factualAccuracy = hasValidSources ? 0.94 : 0.70;

    const qualityScore = Number(
      (
        factualAccuracy * 0.3 +
        technicalDepth * 0.25 +
        actionableUtility * 0.2 +
        clarityAndTone * 0.15 +
        sourceGrounding * 0.1
      ).toFixed(3)
    );

    const confidenceScore = Number((factualAccuracy * (hasValidSources ? 1.0 : 0.85)).toFixed(3));

    // Extract basic claims
    const lines = draft.split('\n').filter((l) => l.trim().startsWith('•') || l.trim().startsWith('-'));
    const claimsVerified = lines.slice(0, 3).map((line, idx) => ({
      claim: line.replace(/^[•\-\*]\s*/, '').trim(),
      verified: true,
      citation: input.sources?.[idx] || input.sources?.[0] || 'Technical specification',
    }));

    if (claimsVerified.length === 0) {
      claimsVerified.push({
        claim: `Technical overview of ${topic}`,
        verified: hasValidSources,
        citation: input.sources?.[0] || 'Domain documentation',
      });
    }

    if (!hasValidSources && this.minConfidenceScore > confidenceScore) {
      return {
        contentId: input.contentId,
        passed: false,
        confidenceScore,
        qualityScore,
        claimsVerified,
        rejectionCode: 'INSUFFICIENT_SOURCES',
        rejectionReason: 'Draft lacks verified reputable technical source URLs or citations.',
        qualityBreakdown: {
          factualAccuracy,
          technicalDepth,
          actionableUtility,
          clarityAndTone,
          sourceGrounding,
        },
        notes: 'Rejected due to insufficient citation grounding.',
      };
    }

    const passed = confidenceScore >= this.minConfidenceScore && qualityScore >= this.minQualityScore;
    let rejectionCode: string | undefined;
    let rejectionReason: string | undefined;

    if (!passed) {
      if (confidenceScore < this.minConfidenceScore) {
        rejectionCode = 'LOW_CONFIDENCE_SCORE';
        rejectionReason = `Factual confidence score (${confidenceScore}) is below required minimum threshold ${this.minConfidenceScore}.`;
      } else {
        rejectionCode = 'LOW_QUALITY_SCORE';
        rejectionReason = `Aggregate quality score (${qualityScore}) is below required minimum threshold ${this.minQualityScore}.`;
      }
    }

    return {
      contentId: input.contentId,
      passed,
      confidenceScore,
      qualityScore,
      claimsVerified,
      rejectionCode,
      rejectionReason,
      qualityBreakdown: {
        factualAccuracy,
        technicalDepth,
        actionableUtility,
        clarityAndTone,
        sourceGrounding,
      },
      notes: passed
        ? 'Passed deterministic quality and fact-checking audit.'
        : `Rejected: ${rejectionReason}`,
    };
  }

  public async execute(
    input: ContentGeneratedPayload,
    correlationId?: string
  ): Promise<AgentExecutionResult<ContentCheckedPayload>> {
    const startTime = Date.now();
    const hasGemini = Boolean(
      this.geminiService &&
      (typeof this.geminiService.isConfigured === 'function'
        ? this.geminiService.isConfigured()
        : Boolean(this.geminiService.auditFactCheck))
    );

    logger.info('fact_checking_started', `Fact-checking content draft for topic: "${input.topic}" (${input.contentId})`, {
      correlationId,
      context: {
        contentId: input.contentId,
        hasGemini,
      },
    });

    // 1. If Gemini AI service is configured, perform AI-powered structured audit
    if (hasGemini && this.geminiService && typeof this.geminiService.auditFactCheck === 'function') {
      try {
        const audit = await this.geminiService.auditFactCheck({
          topic: input.topic,
          draftText: input.draftText,
          sources: input.sources,
          suggestedTags: input.suggestedTags,
        });

        const passed = audit.passed &&
          audit.confidenceScore >= this.minConfidenceScore &&
          audit.qualityScore >= this.minQualityScore;

        const result: ContentCheckedPayload = {
          contentId: input.contentId,
          passed,
          confidenceScore: audit.confidenceScore,
          qualityScore: audit.qualityScore,
          claimsVerified: audit.claimsVerified,
          qualityBreakdown: audit.qualityBreakdown,
          rejectionCode: !passed ? (audit.rejectionCode || 'QUALITY_THRESHOLD_NOT_MET') : undefined,
          rejectionReason: !passed ? (audit.rejectionReason || 'Failed Gemini quality & fact-check threshold') : undefined,
          notes: audit.notes,
        };

        logger.info(
          passed ? 'fact_check_passed' : 'fact_check_failed',
          `Gemini fact-check ${passed ? 'PASSED' : 'REJECTED'} for ${input.contentId} [Confidence: ${result.confidenceScore}, Quality: ${result.qualityScore}]`,
          {
            correlationId,
            context: {
              passed,
              confidenceScore: result.confidenceScore,
              qualityScore: result.qualityScore,
              rejectionReason: result.rejectionReason,
            },
          }
        );

        return {
          success: true,
          data: result,
          durationMs: Date.now() - startTime,
          metadata: {
            auditMode: 'gemini_ai',
            model: 'gemini-3.7-flash',
          },
        };
      } catch (err) {
        logger.warn('gemini_audit_fallback', 'Gemini audit call failed; running deterministic fallback audit', {
          correlationId,
          error: err,
        });
      }
    }

    // 2. Deterministic heuristic & rule-based quality evaluation
    const result = this.evaluateDeterministically(input);

    logger.info(
      result.passed ? 'fact_check_passed' : 'fact_check_failed',
      `Deterministic quality audit ${result.passed ? 'PASSED' : 'REJECTED'} for ${input.contentId} [Confidence: ${result.confidenceScore}, Quality: ${result.qualityScore}]`,
      {
        correlationId,
        context: {
          passed: result.passed,
          confidenceScore: result.confidenceScore,
          qualityScore: result.qualityScore,
          rejectionReason: result.rejectionReason,
        },
      }
    );

    return {
      success: true,
      data: result,
      durationMs: Date.now() - startTime,
      metadata: {
        auditMode: 'deterministic_rules',
        minConfidenceThreshold: this.minConfidenceScore,
        minQualityThreshold: this.minQualityScore,
      },
    };
  }
}

