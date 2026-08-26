/**
 * Autonomous Telegram Channel Manager - Gemini AI Service Abstraction
 *
 * Server-side AI client wrapper.
 * Strictly adheres to @google/genai SDK standards.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { DependencyHealth } from '../types/index.ts';
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
}

export interface IGeminiService {
  isConfigured(): boolean;
  checkHealth(): Promise<DependencyHealth>;
  performResearch(params: GeminiResearchParams): Promise<GeminiResearchResult>;
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
   * Performs deep, structured technical research using Gemini
   */
  public async performResearch(params: GeminiResearchParams): Promise<GeminiResearchResult> {
    if (!this.isConfigured()) {
      throw new GeminiApiError('Cannot perform research: GEMINI_API_KEY is not configured');
    }

    const ai = this.getClient();
    const niche = params.niche || 'AI + technology + automation';
    const topicPrompt = params.topic?.trim()
      ? `Target Research Topic / Seed: "${params.topic.trim()}"`
      : 'Discover a high-impact breakthrough, emerging architecture, developer tooling, or automation pattern.';
    const sourceHintsPrompt = params.sourceHints?.length
      ? `Source Hints / Lead References: ${params.sourceHints.join(', ')}`
      : '';

    const systemInstruction =
      'You are the Autonomous Research Intelligence Agent for TeleCore AI, an elite technical Telegram channel. ' +
      'Editorial Philosophy: "Technology that matters, explained and made useful." ' +
      'Conduct rigorous, objective, practical research without hype or marketing fluff. ' +
      'Focus on tangible technical capabilities, architecture patterns, developer productivity, or automation workflows.';

    const prompt = `Conduct deep technical research for our technology channel.
Channel Niche: ${niche}
${topicPrompt}
${sourceHintsPrompt}

Synthesize a comprehensive research report:
1. topic: A concise, compelling, technical headline for this topic.
2. summary: A thorough 2-3 paragraph technical explanation of the breakthrough or architecture, why it matters, and its practical developer utility.
3. keyTakeaways: An array of 2 to 4 concrete, actionable takeaways.
4. suggestedSources: An array of 1 to 3 reputable documentation references or source URLs.
5. relevanceScore: A float between 0.0 and 1.0 assessing technical depth and practical value.
6. category: A short category descriptor (e.g., 'Autonomous Agents', 'Edge Computing', 'Developer Tooling', 'LLM Infrastructure').`;

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
                description: 'Concise, high-signal topic title',
              },
              summary: {
                type: Type.STRING,
                description: 'Detailed 2-3 paragraph technical synthesis and explanation',
              },
              keyTakeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Actionable technical takeaways',
              },
              suggestedSources: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Relevant source references or URLs',
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

      return {
        topic: res.topic.trim(),
        summary: res.summary.trim(),
        keyTakeaways: Array.isArray(res.keyTakeaways)
          ? res.keyTakeaways.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          : [],
        suggestedSources: Array.isArray(res.suggestedSources)
          ? res.suggestedSources.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          : [],
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
