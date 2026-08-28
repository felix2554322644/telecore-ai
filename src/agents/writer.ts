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
  decision?: EditorialDecision;
  keyTakeaways?: string[];
  suggestedSources?: string[];
  category?: string;
}

export class WriterAgent implements IAgent<WriterInput, ContentGeneratedPayload> {
  public readonly metadata: AgentMetadata = {
    name: 'WriterAgent',
    role: 'writer',
    version: '0.2.0-autonomous',
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
      ? input.summary.trim()
      : 'Technology that matters, explained and made useful.';

    let takeawaysText = '';
    if (input.keyTakeaways && input.keyTakeaways.length > 0) {
      takeawaysText = input.keyTakeaways.map((t) => `• ${t.trim()}`).join('\n');
    } else {
      takeawaysText = '• Actionable insight: Practical workflow automation with distributed edge architecture.\n• Key takeaway: High reliability and sub-second execution.';
    }

    const tags = ['AI', 'TechNews', 'Automation'];

    const draftText = `⚡️ *${input.topic.trim()}*\n\n${cleanSummary}\n\n*Key Highlights:*\n${takeawaysText}\n\n${tags.map((t) => `#${t}`).join(' ')}`;

    const generatedDraft: ContentGeneratedPayload = {
      contentId,
      topic: input.topic.trim(),
      draftText,
      suggestedTags: tags,
      sources: input.suggestedSources && input.suggestedSources.length > 0
        ? input.suggestedSources
        : ['https://arxiv.org', 'https://developer.mozilla.org'],
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
