/**
 * Autonomous Telegram Channel Manager - Strategist Agent
 *
 * Phase 16: Content Quality & Editorial Strategy
 * Evaluates topic value, classifies into content types (NEWS, PRODUCT_RELEASE, RESEARCH, EXPLAINER, etc.),
 * and selects high-signal angles for Telegram publication.
 */

import { AgentExecutionResult, AgentMetadata, BaseEvent, ContentType, IAgent } from '../types/index.ts';
import { Logger } from '../utils/logger.ts';
import { ResearchOutput } from './researcher.ts';

const logger = new Logger('Agent:Strategist');

export interface EditorialDecision {
  shouldPublish: boolean;
  editorialAngle: string;
  targetFormat: 'short_tip' | 'deep_dive' | 'tool_review' | 'news_summary';
  contentType: ContentType;
  priority: 'low' | 'medium' | 'high';
  reasoning: string;
  primaryEntity?: string;
  hookStrategy: string;
  editorialGuidance?: string;
}

export class StrategistAgent implements IAgent<ResearchOutput, EditorialDecision> {
  public readonly metadata: AgentMetadata = {
    name: 'StrategistAgent',
    role: 'strategist',
    version: '0.3.0-editorial-strategy',
    description: 'Evaluates topic value, classifies content types, and determines high-signal editorial angles.',
    isAutonomous: true,
    status: 'ready',
  };

  public canHandle(event: BaseEvent): boolean {
    return event.type === 'content.requested';
  }

  private inferContentType(topic: string, summary: string, existingType?: ContentType): ContentType {
    if (existingType) return existingType;
    const combined = `${topic} ${summary}`.toLowerCase();

    if (combined.includes('release') || combined.includes('v0.') || combined.includes('v1.') || combined.includes('v2.') || combined.includes('launched') || combined.includes('announces')) {
      return 'PRODUCT_RELEASE';
    }
    if (combined.includes('paper') || combined.includes('arxiv') || combined.includes('researchers') || combined.includes('discovered') || combined.includes('novel architecture')) {
      return 'RESEARCH';
    }
    if (combined.includes('benchmark') || combined.includes('evals') || combined.includes('comparison') || combined.includes('tokens/s') || combined.includes('performance test')) {
      return 'BENCHMARK';
    }
    if (combined.includes('how to') || combined.includes('pattern') || combined.includes('guide') || combined.includes('architecture') || combined.includes('design')) {
      return 'EXPLAINER';
    }
    if (combined.includes('analysis') || combined.includes('shift') || combined.includes('trend') || combined.includes('implications')) {
      return 'ANALYSIS';
    }
    return 'NEWS';
  }

  private extractPrimaryEntity(topic: string, summary: string, existingEntity?: string): string {
    if (existingEntity && existingEntity.trim().length > 0) return existingEntity.trim();
    const match = topic.match(/^([A-Za-z0-9\s._-]+?)(?:\s+(?:releases|launches|introduces|announces|open-sources|publishes|v\d|\d\.\d|:))/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return 'Tech Ecosystem';
  }

  public async execute(
    input: ResearchOutput,
    correlationId?: string
  ): Promise<AgentExecutionResult<EditorialDecision>> {
    const startTime = Date.now();
    logger.info('strategy_evaluation_started', `Evaluating editorial strategy for topic: "${input.topic}"`, {
      correlationId,
    });

    const contentType = this.inferContentType(input.topic, input.summary, input.contentType);
    const primaryEntity = this.extractPrimaryEntity(input.topic, input.summary, input.primaryEntity);

    let editorialAngle = 'Practical engineering utility, implementation tradeoffs, and developer workflow impact';
    let targetFormat: EditorialDecision['targetFormat'] = 'short_tip';
    let hookStrategy = 'Direct development announcement and key capability';
    let editorialGuidance = 'Focus on concrete technical differentiation; avoid generic buzzwords; highlight tangible benefits.';

    switch (contentType) {
      case 'PRODUCT_RELEASE':
        targetFormat = 'news_summary';
        editorialAngle = 'What changed, key capabilities added, and immediate developer upgrade value';
        hookStrategy = '⚡️ [PRODUCT/ENTITY]: [WHAT WAS RELEASED]';
        editorialGuidance = 'State the release milestone clearly in sentence 1. Detail 2-3 specific technical improvements. Give practical bottom line.';
        break;
      case 'RESEARCH':
        targetFormat = 'deep_dive';
        editorialAngle = 'Core architectural breakthrough, methodology discovery, and practical engineering relevance';
        hookStrategy = '🔬 [RESEARCH/LAB]: [NOVEL ARCHITECTURE OR METHOD]';
        editorialGuidance = 'Summarize what problem the paper addresses, what mechanism achieves the result, and what it implies for production systems.';
        break;
      case 'BENCHMARK':
        targetFormat = 'tool_review';
        editorialAngle = 'Empirical performance numbers, hardware configuration, and cost/throughput tradeoffs';
        hookStrategy = '📊 [BENCHMARK]: [MEASURED PERFORMANCE SHIFT]';
        editorialGuidance = 'Only cite grounded metrics from the source. Compare baseline vs new. Provide real-world system recommendations.';
        break;
      case 'EXPLAINER':
        targetFormat = 'deep_dive';
        editorialAngle = 'Step-by-step architectural mechanics, implementation pattern, and edge cases';
        hookStrategy = '💡 [TECH/PATTERN]: [HOW IT WORKS IN PRODUCTION]';
        editorialGuidance = 'Explain why traditional approaches fail, how this pattern resolves bottlenecks, and how engineers can adopt it.';
        break;
      case 'ANALYSIS':
        targetFormat = 'deep_dive';
        editorialAngle = 'Macro technology trend, industry inflection point, and structural implications';
        hookStrategy = '🧭 [TREND/ANALYSIS]: [STRUCTURAL SHIFT]';
        editorialGuidance = 'Separate verified market facts from analytical projections. Keep takeaways actionable for tech leads.';
        break;
      case 'NEWS':
      default:
        targetFormat = 'news_summary';
        editorialAngle = 'Breaking technical news, who is affected, and why it matters right now';
        hookStrategy = '⚡️ [BREAKING / NEWS]: [THE KEY DEVELOPMENT]';
        editorialGuidance = 'Lead with the headline event. Explain why this affects the developer ecosystem.';
        break;
    }

    const priority: EditorialDecision['priority'] = input.relevanceScore >= 0.9 ? 'high' : 'medium';

    const decision: EditorialDecision = {
      shouldPublish: true,
      editorialAngle,
      targetFormat,
      contentType,
      priority,
      reasoning: `Selected ${contentType} format prioritizing practical developer utility and channel editorial guidelines.`,
      primaryEntity,
      hookStrategy,
      editorialGuidance,
    };

    logger.info('strategy_evaluation_completed', `Strategy established for "${input.topic}": ${contentType} (${targetFormat})`, {
      correlationId,
      context: { contentType, targetFormat, priority },
    });

    return {
      success: true,
      data: decision,
      durationMs: Date.now() - startTime,
      metadata: {
        contentType,
        targetFormat,
        primaryEntity,
      },
    };
  }
}

