/**
 * Autonomous Telegram Channel Manager - Gemini AI Service Abstraction
 *
 * Server-side AI client wrapper.
 * Strictly adheres to @google/genai SDK standards.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { ClaimType, ContentType, DependencyHealth, GroundedClaim, QualityBreakdown } from '../types/index.ts';
import { GeminiApiError } from '../utils/errors.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('GeminiService');

export interface GeminiResearchParams {
  topic?: string;
  niche?: string;
  sourceHints?: string[];
  maxItems?: number;
}

export interface GeminiResearchResult {
  topic: string;
  summary: string;
  keyTakeaways: string[];
  suggestedSources: string[];
  relevanceScore: number;
  category?: string;
  contentType?: ContentType;
  primaryEntity?: string;
  developmentSummary?: string;
  groundedClaims?: GroundedClaim[];
}

export interface GeminiDraftParams {
  topic: string;
  summary: string;
  contentType?: ContentType;
  primaryEntity?: string;
  developmentSummary?: string;
  keyTakeaways: string[];
  groundedClaims?: GroundedClaim[];
  sources?: string[];
  editorialAngle?: string;
}

export interface GeminiDraftResult {
  draftText: string;
  suggestedTags: string[];
  groundedClaims?: GroundedClaim[];
}

export interface GeminiAuditParams {
  topic: string;
  draftText: string;
  sources?: string[];
  suggestedTags?: string[];
  groundedClaims?: GroundedClaim[];
  contentType?: ContentType;
}

export interface GeminiAuditResult {
  passed: boolean;
  confidenceScore: number;
  qualityScore: number;
  claimsVerified: Array<{
    claim: string;
    verified: boolean;
    citation?: string;
    critique?: string;
    claimType?: ClaimType;
    isQuantitative?: boolean;
  }>;
  rejectionReason?: string;
  rejectionCode?: string;
  qualityBreakdown: QualityBreakdown;
  notes: string;
}

export interface IGeminiService {
  isConfigured(): boolean;
  checkHealth(): Promise<DependencyHealth>;
  performResearch(params: GeminiResearchParams): Promise<GeminiResearchResult>;
  generateEditorialDraft?(params: GeminiDraftParams): Promise<GeminiDraftResult>;
  auditFactCheck(params: GeminiAuditParams): Promise<GeminiAuditResult>;
  generateTextPlaceholder(prompt: string): Promise<string>;
}

export class GeminiService implements IGeminiService {
  private apiKey?: string;
  private client: GoogleGenAI | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey?.trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  private getClient(): GoogleGenAI {
    if (!this.apiKey) {
      throw new GeminiApiError('GEMINI_API_KEY is not configured in environment bindings');
    }

    if (!this.client) {
      this.client = new GoogleGenAI({
        apiKey: this.apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }

    return this.client;
  }

  /**
   * Health and connectivity check for Gemini integration
   */
  public async checkHealth(): Promise<DependencyHealth> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      return {
        name: 'gemini',
        status: 'degraded',
        critical: false,
        message: 'GEMINI_API_KEY is not set (AI generation features are in standby)',
        lastChecked: startTime,
      };
    }

    try {
      // Light check verifying client initialization
      this.getClient();

      return {
        name: 'gemini',
        status: 'healthy',
        critical: false,
        latencyMs: Date.now() - startTime,
        message: 'Gemini service configured and initialized',
        lastChecked: Date.now(),
      };
    } catch (err) {
      logger.error('gemini_health_check_failed', 'Gemini health evaluation failed', { error: err });
      return {
        name: 'gemini',
        status: 'degraded',
        critical: false,
        message: 'Gemini initialization failed',
        latencyMs: Date.now() - startTime,
        lastChecked: Date.now(),
      };
    }
  }

  /**
   * Performs deep, structured technical research using Gemini with strict grounding
   */
  public async performResearch(params: GeminiResearchParams): Promise<GeminiResearchResult> {
    if (!this.isConfigured()) {
      throw new GeminiApiError('Cannot perform research: GEMINI_API_KEY is not configured');
    }

    const ai = this.getClient();
    const niche = params.niche || 'AI + technology + automation';
    const topicPrompt = params.topic?.trim()
      ? `Target Research Topic / Seed: "${params.topic.trim()}"`
      : 'Discover a real, recent high-impact technology release, research paper, official engineering announcement, or developer tool milestone.';
    const sourceHintsPrompt = params.sourceHints?.length
      ? `Source Hints / Reputable References: ${params.sourceHints.join(', ')}`
      : '';

    const systemInstruction =
      'You are the Lead Autonomous Research Intelligence Agent for TeleCore AI (TechPulse AI channel). ' +
      'Editorial Philosophy: "Technology that matters, explained and made useful." ' +
      'MANDATE: Ground all research in REAL, SOURCE-BACKED technology developments (e.g. official engineering blogs, release notes, arXiv papers, major open-source releases). ' +
      'CRITICAL RULES: ' +
      '1. Clearly establish: WHAT happened, WHO did it, WHAT product/technology/paper was involved, and WHY it matters. ' +
      '2. NEVER invent or hallucinate precise statistics, latency numbers, performance multipliers, or dates unless directly documented in primary sources. ' +
      '3. Categorize research into an exact ContentType: NEWS, PRODUCT_RELEASE, RESEARCH, EXPLAINER, BENCHMARK, or ANALYSIS. ' +
      '4. Distinguish clearly between sourced facts, observations, and analytical inferences. ' +
      '5. Only cite reputable technical documentation, engineering blogs, GitHub repos, or research papers.';

    const prompt = `Conduct rigorous, source-grounded technical research for our technology channel.
Channel Niche: ${niche}
${topicPrompt}
${sourceHintsPrompt}

Synthesize a structured research report with:
1. topic: A specific, non-generic headline identifying the exact entity and development (e.g. "vLLM 0.6.0: PagedAttention Memory Optimization", "Cloudflare Workers: Sub-50ms Speculative Decoding Engine").
2. primaryEntity: The company, research lab, or open-source organization (e.g. "Cloudflare", "Meta AI", "vLLM Project", "PyTorch Foundation").
3. contentType: One of "NEWS", "PRODUCT_RELEASE", "RESEARCH", "EXPLAINER", "BENCHMARK", "ANALYSIS".
4. developmentSummary: A clear, factual 2-sentence summary answering what actually happened and who released/discovered it.
5. summary: A thorough technical explanation of the architecture/finding, what problem it solves, and practical developer utility.
6. keyTakeaways: An array of 2 to 4 concrete, actionable takeaways.
7. suggestedSources: 1 to 3 reputable documentation URLs, paper citations, or official blogs.
8. groundedClaims: List of 2 to 4 key factual claims with source attribution and classification ("sourced_fact", "observation", "inference").
9. relevanceScore: Float between 0.0 and 1.0 assessing technical depth and practical value.
10. category: Short category descriptor.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: {
                type: Type.STRING,
                description: 'Specific, high-signal topic title with entity and development',
              },
              primaryEntity: {
                type: Type.STRING,
                description: 'Company, lab, or organization responsible',
              },
              contentType: {
                type: Type.STRING,
                description: 'NEWS, PRODUCT_RELEASE, RESEARCH, EXPLAINER, BENCHMARK, or ANALYSIS',
              },
              developmentSummary: {
                type: Type.STRING,
                description: 'What happened, who did it, and what was announced/discovered',
              },
              summary: {
                type: Type.STRING,
                description: 'Detailed technical synthesis and explanation',
              },
              keyTakeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Actionable technical takeaways',
              },
              suggestedSources: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Reputable source references or URLs',
              },
              groundedClaims: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    claim: { type: Type.STRING },
                    source: { type: Type.STRING },
                    claimType: { type: Type.STRING, description: 'sourced_fact, observation, or inference' },
                    verifiedInSource: { type: Type.BOOLEAN },
                    isQuantitative: { type: Type.BOOLEAN },
                  },
                  required: ['claim', 'source', 'claimType', 'verifiedInSource'],
                },
                description: 'Grounded claims with source links and verified flags',
              },
              relevanceScore: {
                type: Type.NUMBER,
                description: 'Relevance score between 0.0 and 1.0',
              },
              category: {
                type: Type.STRING,
                description: 'Technical category',
              },
            },
            required: ['topic', 'summary', 'keyTakeaways', 'suggestedSources', 'relevanceScore'],
          },
        },
      });

      const responseText = response.text?.trim();
      if (!responseText) {
        throw new GeminiApiError('Gemini returned an empty response for research query');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
      } catch (jsonErr) {
        throw new GeminiApiError('Failed to parse Gemini research JSON response', {
          raw: responseText,
          error: jsonErr instanceof Error ? jsonErr.message : String(jsonErr),
        });
      }

      const res = parsed as Partial<GeminiResearchResult>;
      if (!res.topic || typeof res.topic !== 'string') {
        throw new GeminiApiError('Gemini research output missing valid "topic" string');
      }
      if (!res.summary || typeof res.summary !== 'string') {
        throw new GeminiApiError('Gemini research output missing valid "summary" string');
      }

      const validContentTypes: ContentType[] = ['NEWS', 'PRODUCT_RELEASE', 'RESEARCH', 'EXPLAINER', 'BENCHMARK', 'ANALYSIS'];
      const rawContentType = String(res.contentType || '').toUpperCase() as ContentType;
      const contentType: ContentType = validContentTypes.includes(rawContentType) ? rawContentType : 'PRODUCT_RELEASE';

      const groundedClaims: GroundedClaim[] = Array.isArray(res.groundedClaims)
        ? res.groundedClaims.map((gc) => ({
            claim: String(gc.claim || '').trim(),
            source: String(gc.source || (res.suggestedSources?.[0] || 'https://arxiv.org')).trim(),
            claimType: (['sourced_fact', 'observation', 'inference', 'opinion'].includes(String(gc.claimType))
              ? gc.claimType
              : 'sourced_fact') as ClaimType,
            verifiedInSource: Boolean(gc.verifiedInSource ?? true),
            isQuantitative: Boolean(gc.isQuantitative ?? /\d+/.test(String(gc.claim))),
          }))
        : [];

      return {
        topic: res.topic.trim(),
        summary: res.summary.trim(),
        primaryEntity: typeof res.primaryEntity === 'string' ? res.primaryEntity.trim() : undefined,
        contentType,
        developmentSummary: typeof res.developmentSummary === 'string' ? res.developmentSummary.trim() : undefined,
        keyTakeaways: Array.isArray(res.keyTakeaways)
          ? res.keyTakeaways.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          : [],
        suggestedSources: Array.isArray(res.suggestedSources)
          ? res.suggestedSources.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          : [],
        groundedClaims,
        relevanceScore:
          typeof res.relevanceScore === 'number' && !isNaN(res.relevanceScore)
            ? Math.max(0, Math.min(1, res.relevanceScore))
            : 0.85,
        category: typeof res.category === 'string' ? res.category.trim() : 'AI & Automation',
      };
    } catch (err) {
      logger.error('gemini_research_failed', 'Failed to execute Gemini research request', { error: err });
      if (err instanceof GeminiApiError) {
        throw err;
      }
      throw new GeminiApiError('Gemini research generation failed', {
        reason: err instanceof Error ? err.message : 'Unknown AI error',
      });
    }
  }

  /**
   * Generates a human-written, high-signal Telegram post draft using Gemini
   */
  public async generateEditorialDraft(params: GeminiDraftParams): Promise<GeminiDraftResult> {
    if (!this.isConfigured()) {
      throw new GeminiApiError('Cannot generate draft: GEMINI_API_KEY is not configured');
    }

    const ai = this.getClient();
    const systemInstruction =
      'You are the Senior Technical Editor for TechPulse AI, an elite technical Telegram channel for software engineers, architects, and AI practitioners. ' +
      'Editorial Philosophy: "Technology that matters, explained and made useful." ' +
      'WRITING RULES: ' +
      '1. NEVER use generic AI fluff or banned clichés (e.g. "Deep technical analysis...", "In today\'s rapidly evolving...", "Key highlights:", "game-changing", "revolutionary", "cutting-edge", "unleash", "supercharge"). ' +
      '2. ALWAYS answer: What happened? Who did it? Why does it matter? What is the practical takeaway? ' +
      '3. Structure the post cleanly for Telegram: ' +
      '   ⚡️ [ENTITY / PRODUCT]: [WHAT HAPPENED] ' +
      '   [1-2 clear sentences explaining the development and what problem it solves] ' +
      '   Why it matters: ' +
      '   • [Point 1: concrete technical capability] ' +
      '   • [Point 2: developer workflow / practical benefit] ' +
      '   • [Point 3: architectural implication] ' +
      '   Bottom line: ' +
      '   [One concise, actionable sentence for engineers] ' +
      '   #Tags ' +
      '4. NEVER invent quantitative numbers or statistics that are not present in the research inputs.';

    const prompt = `Craft a punchy, highly readable Telegram channel post based on this research:
Topic: "${params.topic}"
Content Type: ${params.contentType || 'PRODUCT_RELEASE'}
Primary Entity: ${params.primaryEntity || 'Engineering Team'}
Development Summary: ${params.developmentSummary || params.summary}
Key Research Takeaways:
${params.keyTakeaways.map((t) => `• ${t}`).join('\n')}
Grounded Claims:
${params.groundedClaims?.map((c) => `- ${c.claim} (${c.claimType}, Source: ${c.source})`).join('\n') || 'None'}
Sources: ${params.sources?.join(', ') || 'Official documentation'}
Editorial Angle: ${params.editorialAngle || 'Practical engineering utility and real-world adoption'}

Generate:
1. draftText: Formatted Telegram post adhering to editorial structure with markdown bolding and bullet points.
2. suggestedTags: Array of 2 to 4 clean technical hashtags without # symbols (e.g. ["LLM", "Cloudflare", "Inference"]).`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              draftText: {
                type: Type.STRING,
                description: 'Full formatted Telegram post text with bolding and bullet points',
              },
              suggestedTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 relevant hashtags without #',
              },
            },
            required: ['draftText', 'suggestedTags'],
          },
        },
      });

      const responseText = response.text?.trim();
      if (!responseText) {
        throw new GeminiApiError('Gemini returned an empty response for draft generation');
      }

      const parsed = JSON.parse(responseText) as Partial<GeminiDraftResult>;
      return {
        draftText: parsed.draftText?.trim() || '',
        suggestedTags: Array.isArray(parsed.suggestedTags)
          ? parsed.suggestedTags.map((t) => t.replace(/^#+/, '').trim()).filter((t) => t.length > 0)
          : ['AI', 'TechNews', 'Engineering'],
        groundedClaims: params.groundedClaims,
      };
    } catch (err) {
      logger.error('gemini_draft_failed', 'Failed to generate editorial draft with Gemini', { error: err });
      if (err instanceof GeminiApiError) throw err;
      throw new GeminiApiError('Gemini draft generation failed', {
        reason: err instanceof Error ? err.message : 'Unknown AI error',
      });
    }
  }

  /**
   * Performs deep, structured fact-checking and multi-factor quality audit on candidate drafts
   */
  public async auditFactCheck(params: GeminiAuditParams): Promise<GeminiAuditResult> {
    if (!this.isConfigured()) {
      throw new GeminiApiError('Cannot perform fact-check audit: GEMINI_API_KEY is not configured');
    }

    const ai = this.getClient();
    const systemInstruction =
      'You are the Elite Fact-Checking & Quality Audit Intelligence for TeleCore AI (TechPulse AI channel). ' +
      'Editorial Philosophy: "Technology that matters, explained and made useful." ' +
      'GATEKEEPING MANDATE: You are an authoritative quality and fact-checking gate. ' +
      'AUDIT RULES: ' +
      '1. REJECT any post containing UNGROUNDED or FABRICATED quantitative claims (e.g. invented latency numbers like "sub-50ms", made-up benchmarks, speedup percentages). ' +
      '2. REJECT posts with generic AI slop ("Deep technical analysis...", "In today\'s rapidly evolving world...", "This innovative approach..."). ' +
      '3. REJECT posts lacking verifiable primary sources or presenting speculation as fact. ' +
      '4. PASS only posts that are substantive, accurate, fact-checked, useful for engineers, and properly formatted for Telegram.';

    const prompt = `Perform an exhaustive fact-checking and editorial quality audit on this candidate post:
Topic: "${params.topic}"
Content Type: ${params.contentType || 'PRODUCT_RELEASE'}
Draft Content:
"""
${params.draftText}
"""
Cited Sources: ${params.sources && params.sources.length > 0 ? params.sources.join(', ') : 'None'}
Known Grounded Claims: ${params.groundedClaims?.map((c) => `[${c.claimType}] ${c.claim} (Source: ${c.source})`).join('; ') || 'None'}
Suggested Tags: ${params.suggestedTags && params.suggestedTags.length > 0 ? params.suggestedTags.join(', ') : 'None'}

Evaluate the candidate on:
1. factualAccuracy (0.0 to 1.0): Are technical claims accurate, grounded in cited sources, and free of hallucinations?
2. sourceGrounding (0.0 to 1.0): Are credible, authoritative sources present and supporting the claims?
3. technicalDepth (0.0 to 1.0): Is the content technically substantial rather than shallow AI fluff?
4. actionableUtility (0.0 to 1.0): Does it provide clear engineering, architectural, or developer workflow value?
5. clarityAndTone (0.0 to 1.0): Is the tone objective, crisp, human-written, and free from promotional hyperbole?
6. telegramSuitability (0.0 to 1.0): Is the structure clean, scannable, and engaging for Telegram mobile readers?

Criteria for Passing:
- confidenceScore >= 0.80
- qualityScore >= 0.75
- Zero ungrounded quantitative claims
- Zero banned AI clichés or promotional hype`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              passed: {
                type: Type.BOOLEAN,
                description: 'True if candidate meets all quality, factual, and editorial standards',
              },
              confidenceScore: {
                type: Type.NUMBER,
                description: 'Factual verification confidence (0.0 - 1.0)',
              },
              qualityScore: {
                type: Type.NUMBER,
                description: 'Overall aggregate post quality score (0.0 - 1.0)',
              },
              claimsVerified: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    claim: { type: Type.STRING },
                    verified: { type: Type.BOOLEAN },
                    citation: { type: Type.STRING },
                    critique: { type: Type.STRING },
                    claimType: { type: Type.STRING },
                    isQuantitative: { type: Type.BOOLEAN },
                  },
                  required: ['claim', 'verified'],
                },
                description: 'Detailed list of core technical claims evaluated',
              },
              rejectionReason: {
                type: Type.STRING,
                description: 'Detailed explanation if candidate failed audit, or empty if passed',
              },
              rejectionCode: {
                type: Type.STRING,
                description: 'Code e.g. UNSUPPORTED_QUANTITATIVE_CLAIM, UNSUPPORTED_FACTUAL_CLAIM, GENERIC_AI_SLOP, INSUFFICIENT_SOURCES, LOW_CONFIDENCE_SCORE, LOW_QUALITY_SCORE',
              },
              qualityBreakdown: {
                type: Type.OBJECT,
                properties: {
                  factualAccuracy: { type: Type.NUMBER },
                  technicalDepth: { type: Type.NUMBER },
                  actionableUtility: { type: Type.NUMBER },
                  clarityAndTone: { type: Type.NUMBER },
                  sourceGrounding: { type: Type.NUMBER },
                  claimGrounding: { type: Type.NUMBER },
                  telegramSuitability: { type: Type.NUMBER },
                },
                required: ['factualAccuracy', 'technicalDepth', 'actionableUtility', 'clarityAndTone', 'sourceGrounding'],
              },
              notes: {
                type: Type.STRING,
                description: 'Auditor notes and feedback for editorial log',
              },
            },
            required: ['passed', 'confidenceScore', 'qualityScore', 'claimsVerified', 'qualityBreakdown', 'notes'],
          },
        },
      });

      const responseText = response.text?.trim();
      if (!responseText) {
        throw new GeminiApiError('Gemini returned an empty response for fact-check audit');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
      } catch (jsonErr) {
        throw new GeminiApiError('Failed to parse Gemini audit JSON response', {
          raw: responseText,
          error: jsonErr instanceof Error ? jsonErr.message : String(jsonErr),
        });
      }

      const res = parsed as Partial<GeminiAuditResult>;
      const qb = res.qualityBreakdown || {
        factualAccuracy: 0.9,
        technicalDepth: 0.85,
        actionableUtility: 0.85,
        clarityAndTone: 0.9,
        sourceGrounding: 0.85,
      };

      const confidenceScore =
        typeof res.confidenceScore === 'number' && !isNaN(res.confidenceScore)
          ? Math.max(0, Math.min(1, res.confidenceScore))
          : 0.88;

      const qualityScore =
        typeof res.qualityScore === 'number' && !isNaN(res.qualityScore)
          ? Math.max(0, Math.min(1, res.qualityScore))
          : 0.86;

      const passed = Boolean(res.passed && confidenceScore >= 0.8 && qualityScore >= 0.75);

      return {
        passed,
        confidenceScore,
        qualityScore,
        claimsVerified: Array.isArray(res.claimsVerified)
          ? res.claimsVerified.map((c) => ({
              claim: String(c.claim || '').trim(),
              verified: Boolean(c.verified),
              citation: typeof c.citation === 'string' ? c.citation : undefined,
              critique: typeof c.critique === 'string' ? c.critique : undefined,
              claimType: (c.claimType as ClaimType) || 'sourced_fact',
              isQuantitative: Boolean(c.isQuantitative),
            }))
          : [],
        rejectionReason: !passed ? (res.rejectionReason?.trim() || 'Did not meet quality or confidence thresholds') : undefined,
        rejectionCode: !passed ? (res.rejectionCode?.trim() || (confidenceScore < 0.8 ? 'LOW_CONFIDENCE_SCORE' : 'LOW_QUALITY_SCORE')) : undefined,
        qualityBreakdown: {
          factualAccuracy: Math.max(0, Math.min(1, qb.factualAccuracy ?? 0.85)),
          technicalDepth: Math.max(0, Math.min(1, qb.technicalDepth ?? 0.85)),
          actionableUtility: Math.max(0, Math.min(1, qb.actionableUtility ?? 0.85)),
          clarityAndTone: Math.max(0, Math.min(1, qb.clarityAndTone ?? 0.85)),
          sourceGrounding: Math.max(0, Math.min(1, qb.sourceGrounding ?? 0.85)),
          claimGrounding: typeof qb.claimGrounding === 'number' ? Math.max(0, Math.min(1, qb.claimGrounding)) : 0.90,
          telegramSuitability: typeof qb.telegramSuitability === 'number' ? Math.max(0, Math.min(1, qb.telegramSuitability)) : 0.90,
        },
        notes: res.notes?.trim() || 'Audit completed.',
      };
    } catch (err) {
      logger.error('gemini_audit_failed', 'Failed to execute Gemini audit request', { error: err });
      if (err instanceof GeminiApiError) {
        throw err;
      }
      throw new GeminiApiError('Gemini fact-check audit failed', {
        reason: err instanceof Error ? err.message : 'Unknown AI error',
      });
    }
  }

  /**
   * Foundation placeholder for text generation.
   * Future agents (Writer, Strategist) will invoke this interface.
   */
  public async generateTextPlaceholder(prompt: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new GeminiApiError('Cannot generate text: GEMINI_API_KEY is not configured');
    }

    try {
      const ai = this.getClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
      });

      return response.text || '';
    } catch (err) {
      logger.error('gemini_generation_failed', 'Failed to generate content with Gemini', { error: err });
      throw new GeminiApiError('Gemini generation request failed', {
        reason: err instanceof Error ? err.message : 'Unknown AI error',
      });
    }
  }
}
