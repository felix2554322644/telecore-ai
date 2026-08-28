/**
 * Autonomous Telegram Channel Manager - Writer Agent
 *
 * Phase 16: Content Quality & Editorial Writing
 * Crafts crisp, human-written, high-signal Telegram channel posts adhering to TechPulse AI's voice.
 * Formats structured posts with clear context, "Why it matters", and "Bottom line".
 */

import { IGeminiService } from '../ai/gemini.ts';
import {
  AgentExecutionResult,
  AgentMetadata,
  BaseEvent,
  ContentGeneratedPayload,
  ContentType,
  GroundedClaim,
  IAgent,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';
import { EditorialDecision } from './strategist.ts';

const logger = new Logger('Agent:Writer');

export interface WriterInput {
  topic: string;
  summary: string;
  decision?: EditorialDecision;
  keyTakeaways?: string[];
  suggestedSources?: string[];
  category?: string;
  contentType?: ContentType;
  primaryEntity?: string;
  developmentSummary?: string;
  groundedClaims?: GroundedClaim[];
}

export class WriterAgent implements IAgent<WriterInput, ContentGeneratedPayload> {
  public readonly metadata: AgentMetadata = {
    name: 'WriterAgent',
    role: 'writer',
    version: '0.3.0-editorial-writer',
    description: 'Generates crisp, structured, high-signal Telegram posts free of AI clichés.',
    isAutonomous: true,
    status: 'ready',
  };

  constructor(private geminiService?: IGeminiService) {}

  public canHandle(event: BaseEvent): boolean {
    return event.type === 'content.requested';
  }

  /**
   * Sanitizes text to remove generic AI clichés and fluff
   */
  private sanitizeAiSlop(text: string): string {
    let clean = text;

    // Replace generic introductory formulas
    clean = clean.replace(/Deep technical analysis of\s*/gi, '');
    clean = clean.replace(/In today['’]?s (?:fast-paced|rapidly evolving|dynamic) (?:tech|world|landscape),?\s*/gi, '');
    clean = clean.replace(/In this article,? we (?:will )?explore\s*/gi, '');
    clean = clean.replace(/As we all know,?\s*/gi, '');
    clean = clean.replace(/\*Key Highlights:\*/gi, '*Why it matters:*');
    clean = clean.replace(/Key Highlights:/gi, 'Why it matters:');

    // Replace buzzwords with neutral technical equivalents
    clean = clean.replace(/\bgame-changing\b/gi, 'high-impact');
    clean = clean.replace(/\brevolutionary\b/gi, 'novel');
    clean = clean.replace(/\bcutting-edge\b/gi, 'modern');
    clean = clean.replace(/\bunleash(?:ing)?\b/gi, 'enabling');
    clean = clean.replace(/\bsupercharge(?:d)?\b/gi, 'accelerated');
    clean = clean.replace(/\bseamlessly\b/gi, 'directly');
    clean = clean.replace(/\bdelve into\b/gi, 'examine');

    return clean.trim();
  }

  private extractTags(topic: string, category?: string, suggestedTags?: string[]): string[] {
    if (suggestedTags && suggestedTags.length > 0) {
      return suggestedTags.slice(0, 4).map((t) => t.replace(/^#+/, '').trim());
    }

    const tags: string[] = [];
    const lower = `${topic} ${category || ''}`.toLowerCase();

    if (lower.includes('llm') || lower.includes('gpt') || lower.includes('gemini') || lower.includes('claude') || lower.includes('deepseek')) tags.push('LLM');
    if (lower.includes('agent') || lower.includes('orchestrat')) tags.push('Agents');
    if (lower.includes('edge') || lower.includes('worker') || lower.includes('serverless')) tags.push('EdgeComputing');
    if (lower.includes('pytorch') || lower.includes('cuda') || lower.includes('gpu') || lower.includes('vllm')) tags.push('AIInfrastructure');
    if (lower.includes('cloud') || lower.includes('infra') || lower.includes('kubernetes')) tags.push('DevOps');
    if (lower.includes('security') || lower.includes('auth')) tags.push('Security');

    if (tags.length === 0) {
      tags.push('AI', 'TechNews', 'Engineering');
    }

    return Array.from(new Set(tags)).slice(0, 3);
  }

  private buildDeterministicPost(input: WriterInput): { draftText: string; tags: string[] } {
    const topic = this.sanitizeAiSlop(input.topic.trim());
    const entity = input.primaryEntity || input.decision?.primaryEntity || 'Tech Ecosystem';
    const contentType = input.contentType || input.decision?.contentType || 'PRODUCT_RELEASE';

    // Hook emoji by content type
    let hookEmoji = '⚡️';
    if (contentType === 'RESEARCH') hookEmoji = '🔬';
    else if (contentType === 'BENCHMARK') hookEmoji = '📊';
    else if (contentType === 'EXPLAINER') hookEmoji = '💡';
    else if (contentType === 'ANALYSIS') hookEmoji = '🧭';

    // Construct headline
    let headline = `${hookEmoji} *${entity.toUpperCase()}: ${topic}*`;
    if (topic.toLowerCase().startsWith(entity.toLowerCase())) {
      headline = `${hookEmoji} *${topic}*`;
    }

    // Lead paragraph
    let lead = input.developmentSummary
      ? input.developmentSummary.trim()
      : input.summary.replace(/Deep technical analysis of\s*/gi, '').trim();

    lead = this.sanitizeAiSlop(lead);

    // Bullet points (Why it matters)
    const takeaways = input.keyTakeaways && input.keyTakeaways.length > 0
      ? input.keyTakeaways.map((t) => `• ${this.sanitizeAiSlop(t)}`)
      : [
          '• High throughput execution with minimal memory footprint.',
          '• Direct integration into existing developer pipelines.',
          '• Predictable failover behavior under production workloads.',
        ];

    // Bottom line
    let bottomLine = 'Enables teams to deploy higher-efficiency architectures without infrastructure lock-in.';
    if (contentType === 'RESEARCH') {
      bottomLine = 'Provides a rigorous theoretical blueprint for scaling production inference systems.';
    } else if (contentType === 'PRODUCT_RELEASE') {
      bottomLine = 'Ready for developer testing with immediate performance improvements.';
    } else if (contentType === 'BENCHMARK') {
      bottomLine = 'Provides empirical guidance for optimizing compute budgets and inference latency.';
    }

    const tags = this.extractTags(topic, input.category);
    const sourceLink = input.suggestedSources?.[0] || 'https://arxiv.org';

    const draftText = [
      headline,
      '',
      lead,
      '',
      '*Why it matters:*',
      ...takeaways,
      '',
      `*Bottom line:* ${bottomLine}`,
      '',
      `🔗 [Source](${sourceLink})`,
      tags.map((t) => `#${t}`).join(' '),
    ].join('\n');

    return { draftText, tags };
  }

  public async execute(
    input: WriterInput,
    correlationId?: string
  ): Promise<AgentExecutionResult<ContentGeneratedPayload>> {
    const startTime = Date.now();
    logger.info('writing_post_started', `Writing post for topic: "${input.topic}"`, { correlationId });

    const contentId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sources = input.suggestedSources && input.suggestedSources.length > 0
      ? input.suggestedSources
      : ['https://arxiv.org'];

    // If Gemini is available and configured, leverage Gemini for high-signal human-like copy
    if (this.geminiService && this.geminiService.isConfigured() && typeof this.geminiService.generateEditorialDraft === 'function') {
      try {
        logger.info('gemini_writer_invoked', `Generating editorial draft via Gemini for: "${input.topic}"`, {
          correlationId,
        });

        const geminiDraft = await this.geminiService.generateEditorialDraft({
          topic: input.topic,
          summary: input.summary,
          contentType: input.contentType || input.decision?.contentType,
          primaryEntity: input.primaryEntity || input.decision?.primaryEntity,
          developmentSummary: input.developmentSummary,
          keyTakeaways: input.keyTakeaways || [],
          groundedClaims: input.groundedClaims,
          sources,
          editorialAngle: input.decision?.editorialAngle,
        });

        if (geminiDraft.draftText && geminiDraft.draftText.length > 50) {
          const sanitized = this.sanitizeAiSlop(geminiDraft.draftText);
          const tags = (geminiDraft.suggestedTags && geminiDraft.suggestedTags.length > 0)
            ? geminiDraft.suggestedTags.map((t) => t.replace(/^#+/, '').trim())
            : this.extractTags(input.topic, input.category);

          const generatedDraft: ContentGeneratedPayload = {
            contentId,
            topic: input.topic.trim(),
            draftText: sanitized,
            suggestedTags: tags,
            sources,
            contentType: input.contentType || input.decision?.contentType,
            primaryEntity: input.primaryEntity || input.decision?.primaryEntity,
            developmentSummary: input.developmentSummary,
            groundedClaims: input.groundedClaims,
          };

          return {
            success: true,
            data: generatedDraft,
            durationMs: Date.now() - startTime,
            metadata: {
              source: 'gemini_editorial',
              model: 'gemini-3.7-flash',
            },
          };
        }
      } catch (err) {
        logger.warn('gemini_draft_failed_fallback', 'Gemini draft writing failed, using deterministic template', {
          correlationId,
          error: err,
        });
      }
    }

    // Deterministic high-signal template formulation
    const { draftText, tags } = this.buildDeterministicPost(input);

    const generatedDraft: ContentGeneratedPayload = {
      contentId,
      topic: input.topic.trim(),
      draftText,
      suggestedTags: tags,
      sources,
      contentType: input.contentType || input.decision?.contentType,
      primaryEntity: input.primaryEntity || input.decision?.primaryEntity,
      developmentSummary: input.developmentSummary,
      groundedClaims: input.groundedClaims,
    };

    return {
      success: true,
      data: generatedDraft,
      durationMs: Date.now() - startTime,
      metadata: {
        source: 'deterministic_template',
      },
    };
  }
}

