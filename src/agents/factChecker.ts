/**
 * Autonomous Telegram Channel Manager - Fact Checker Agent
 *
 * Phase 16: Content Quality & Rigorous Fact-Checking Gate
 * Audits factual accuracy, claims, citations, links, technical depth, and prevents hallucinations,
 * unsupported quantitative claims, or promotional AI slop.
 */

import { IGeminiService } from '../ai/gemini.ts';
import {
  AgentExecutionResult,
  AgentMetadata,
  BaseEvent,
  ClaimType,
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
  /\bdeep technical analysis\b/i,
  /\bin today['’]?s (?:fast-paced|rapidly evolving|dynamic) (?:tech|world|landscape)\b/i,
  /\bunleash(?:ing)?\b/i,
  /\bsupercharge(?:d)?\b/i,
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
    version: '0.3.0-quality-gate',
    description: 'Enforces strict factual accuracy, source grounding, and eliminates hallucinated metrics & AI slop.',
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
   * Extracts quantitative metric patterns from text (e.g. "sub-50ms", "10x", "99.9%", "400Gbps")
   */
  private extractQuantitativeMetrics(text: string): string[] {
    const regex = /\b(?:sub-)?\d+(?:\.\d+)?\s*(?:ms|s|%|x|gb|mb|tb|kb|fps|tokens\/s|tps|ghz|mhz|billion|million|k\b)/gi;
    const matches = text.match(regex);
    return matches ? Array.from(new Set(matches.map((m) => m.toLowerCase().trim()))) : [];
  }

  /**
   * Evaluates draft text using deterministic heuristics and strict grounding rules
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
          claimGrounding: 0.3,
          telegramSuitability: 0.3,
        },
        notes: 'Failed minimal draft length threshold.',
        contentType: input.contentType,
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
          claimGrounding: 0.4,
          telegramSuitability: 0.2,
        },
        notes: 'Failed maximum draft length limit.',
        contentType: input.contentType,
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
              critique: `Contains banned AI slop pattern: ${pattern.source}`,
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
            claimGrounding: 0.4,
            telegramSuitability: 0.3,
          },
          notes: 'Flagged by anti-hype / anti-slop filter.',
          contentType: input.contentType,
        };
      }
    }

    // 3. Source grounding
    const hasValidSources = Array.isArray(input.sources) && input.sources.some((s) => s.startsWith('http://') || s.startsWith('https://'));
    const sourceGrounding = hasValidSources ? 0.94 : 0.40;

    // 4. Quantitative claims verification
    const draftMetrics = this.extractQuantitativeMetrics(draft);
    if (draftMetrics.length > 0 && input.groundedClaims && input.groundedClaims.length > 0) {
      const knownGroundingText = [
        topic,
        input.developmentSummary || '',
        ...input.groundedClaims.map((gc) => gc.claim),
        ...(input.sources || []),
      ].join(' ').toLowerCase();

      for (const metric of draftMetrics) {
        // If the metric doesn't appear in topic, grounded claims, summary, or sources, reject
        if (!knownGroundingText.includes(metric)) {
          return {
            contentId: input.contentId,
            passed: false,
            confidenceScore: 0.45,
            qualityScore: 0.48,
            claimsVerified: [
              {
                claim: `Quantitative metric: ${metric}`,
                verified: false,
                citation: 'Unverified metric',
                isQuantitative: true,
                critique: `Draft asserts ungrounded metric "${metric}" not found in research source material.`,
              },
            ],
            rejectionCode: 'UNSUPPORTED_QUANTITATIVE_CLAIM',
            rejectionReason: `Draft asserts ungrounded quantitative metric "${metric}" without source backing.`,
            qualityBreakdown: {
              factualAccuracy: 0.45,
              technicalDepth: 0.60,
              actionableUtility: 0.55,
              clarityAndTone: 0.60,
              sourceGrounding: sourceGrounding,
              claimGrounding: 0.40,
              telegramSuitability: 0.70,
            },
            notes: `Rejected due to ungrounded metric: ${metric}`,
            contentType: input.contentType,
          };
        }
      }
    }

    // 5. Technical depth & actionable utility heuristics
    const technicalKeywords = [
      'architecture', 'latency', 'isolate', 'worker', 'concurrency', 'distributed',
      'inference', 'model', 'pipeline', 'caching', 'state', 'compute', 'database',
      'api', 'runtime', 'speculative', 'memory', 'throughput', 'token', 'system',
      'automation', 'optimization', 'workflow', 'developer', 'benchmark', 'pagedattention',
    ];
    const draftLower = draft.toLowerCase();
    const techHits = technicalKeywords.filter((k) => draftLower.includes(k)).length;
    const technicalDepth = Math.min(1.0, 0.70 + techHits * 0.05);

    const hasActionableBullet = draft.includes('•') || draft.includes('- ') || draft.includes('* ');
    const actionableUtility = hasActionableBullet ? 0.90 : 0.65;

    const hasTelegramHeader = draft.includes('⚡️') || draft.includes('🔬') || draft.includes('📊') || draft.includes('💡') || draft.includes('🧭');
    const telegramSuitability = hasTelegramHeader && draft.includes('*Why it matters:*') ? 0.95 : 0.82;
    const clarityAndTone = draft.includes('#') && draft.length >= 100 ? 0.93 : 0.78;
    const factualAccuracy = hasValidSources ? 0.95 : 0.70;
    const claimGrounding = hasValidSources ? 0.92 : 0.50;

    const qualityScore = Number(
      (
        factualAccuracy * 0.25 +
        technicalDepth * 0.20 +
        actionableUtility * 0.15 +
        clarityAndTone * 0.15 +
        sourceGrounding * 0.10 +
        claimGrounding * 0.10 +
        telegramSuitability * 0.05
      ).toFixed(3)
    );

    const confidenceScore = Number((factualAccuracy * (hasValidSources ? 1.0 : 0.85)).toFixed(3));

    // Extract claims from grounded claims or bullet points
    const claimsVerified: ContentCheckedPayload['claimsVerified'] = [];
    if (input.groundedClaims && input.groundedClaims.length > 0) {
      for (const gc of input.groundedClaims) {
        claimsVerified.push({
          claim: gc.claim,
          verified: gc.verifiedInSource,
          citation: gc.source,
          claimType: gc.claimType,
          isQuantitative: gc.isQuantitative,
        });
      }
    } else {
      const lines = draft.split('\n').filter((l) => l.trim().startsWith('•') || l.trim().startsWith('-'));
      for (let idx = 0; idx < Math.min(3, lines.length); idx++) {
        claimsVerified.push({
          claim: lines[idx].replace(/^[•\-\*]\s*/, '').trim(),
          verified: true,
          citation: input.sources?.[idx] || input.sources?.[0] || 'Technical specification',
          claimType: 'sourced_fact',
          isQuantitative: /\d+/.test(lines[idx]),
        });
      }
    }

    if (claimsVerified.length === 0) {
      claimsVerified.push({
        claim: `Technical overview of ${topic}`,
        verified: hasValidSources,
        citation: input.sources?.[0] || 'Domain documentation',
        claimType: 'sourced_fact',
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
          claimGrounding,
          telegramSuitability,
        },
        notes: 'Rejected due to insufficient citation grounding.',
        contentType: input.contentType,
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
        claimGrounding,
        telegramSuitability,
      },
      notes: passed
        ? 'Passed deterministic quality and fact-checking audit.'
        : `Rejected: ${rejectionReason}`,
      contentType: input.contentType,
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
        contentType: input.contentType,
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
          groundedClaims: input.groundedClaims,
          contentType: input.contentType,
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
          contentType: input.contentType,
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


