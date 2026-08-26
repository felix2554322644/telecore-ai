/**
 * Autonomous Telegram Channel Manager - Writer Agent
 *
 * Foundation Phase: Interface and placeholder implementation.
 * Crafts formatted Telegram posts adhering to the editorial voice.
 */

import { AgentExecutionResult, AgentMetadata, BaseEvent, ContentGeneratedPayload, IAgent } from '../types/index.ts';
import { Logger } from '../utils/logger.ts';
import { EditorialDecision } from './strategist.ts';

const logger = new Logger('Agent:Writer');

export interface WriterInput {
  topic: string;
  summary: string;
  decision: EditorialDecision;
}

export class WriterAgent implements IAgent<WriterInput, ContentGeneratedPayload> {
  public readonly metadata: AgentMetadata = {
    name: 'WriterAgent',
    role: 'writer',
    version: '0.1.0-foundation',
    description: 'Generates high-engagement, concise, and structured Telegram channel posts.',
    isAutonomous: false,
    status: 'ready',
  };

  public canHandle(event: BaseEvent): boolean {
    return event.type === 'content.requested';
  }

  public async execute(
    input: WriterInput,
    correlationId?: string
  ): Promise<AgentExecutionResult<ContentGeneratedPayload>> {
    const startTime = Date.now();
    logger.info('writing_post_started', `Writing post for topic: ${input.topic}`, { correlationId });

    const contentId = `draft_${Date.now()}`;
    const cleanSummary = input.summary && input.summary.length > 20
      ? input.summary
      : 'Technology that matters, explained and made useful.';

    const generatedDraft: ContentGeneratedPayload = {
      contentId,
      topic: input.topic,
      draftText: `⚡️ *${input.topic}*\n\n${cleanSummary}\n\n• Actionable insight: Practical workflow automation with distributed edge architecture.\n• Key takeaway: High reliability and sub-second execution.\n\n#AI #Automation #TechTips`,
      suggestedTags: ['AI', 'Automation', 'TechTips'],
      sources: ['https://developer.mozilla.org', 'https://arxiv.org'],
    };

    return {
      success: true,
      data: generatedDraft,
      durationMs: Date.now() - startTime,
      metadata: {
        note: 'Editorial draft formulated from research intelligence.',
      },
    };
  }
}
