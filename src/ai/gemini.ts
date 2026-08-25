/**
 * Autonomous Telegram Channel Manager - Gemini AI Service Abstraction
 *
 * Server-side AI client wrapper.
 * Strictly adheres to @google/genai SDK standards.
 */

import { GoogleGenAI } from '@google/genai';
import { DependencyHealth } from '../types/index.ts';
import { GeminiApiError } from '../utils/errors.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('GeminiService');

export interface IGeminiService {
  isConfigured(): boolean;
  checkHealth(): Promise<DependencyHealth>;
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
