/**
 * Autonomous Telegram Channel Manager - Strategist Agent
 *
 * Foundation Phase: Interface and placeholder implementation.
 * Decides whether a topic matches the channel editorial guidelines and what angle to take.
 */

import { AgentExecutionResult, AgentMetadata, BaseEvent, IAgent } from '../types/index.ts';
import { Logger } from '../utils/logger.ts';
import { ResearchOutput } from './researcher.ts';

const logger = new Logger('Agent:Strategist');

export interface EditorialDecision {
  shouldPublish: boolean;
  editorialAngle: string;
  targetFormat: 'short_tip' | 'deep_dive' | 'tool_review' | 'news_summary';
  priority: 'low' | 'medium' | 'high';
  reasoning: string;
}

export class StrategistAgent implements IAgent<ResearchOutput, EditorialDecision> {
  public readonly metadata: AgentMetadata = {
    name: 'StrategistAgent',
    role: 'strategist',
    version: '0.1.0-foundation',
    description: 'Evaluates topic value, editorial relevance, and selects optimal post angles.',
    isAutonomous: false,
    status: 'ready',
  };

  public canHandle(event: BaseEvent): boolean {
    return event.type === 'content.requested';
  }

  public async execute(
    input: ResearchOutput,
    correlationId?: string
  ): Promise<AgentExecutionResult<EditorialDecision>> {
    const startTime = Date.now();
    logger.info('strategy_evaluation_started', `Evaluating editorial strategy for topic: ${input.topic}`, {
      correlationId,
    });

    const decision: EditorialDecision = {
      shouldPublish: true,
      editorialAngle: 'Practical productivity impact and developer workflow automation',
      targetFormat: 'short_tip',
      priority: 'high',
      reasoning: 'Aligns with core editorial philosophy: Technology that matters, explained and made useful.',
    };

    return {
      success: true,
      data: decision,
      durationMs: Date.now() - startTime,
      metadata: {
        note: 'Foundation placeholder output.',
      },
    };
  }
}
