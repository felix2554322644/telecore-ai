/**
 * Autonomous Telegram Channel Manager - Publisher Agent
 *
 * Foundation Phase: Interface and placeholder implementation.
 * Coordinates dispatching approved content to Telegram channels.
 */

import { isAutonomousPublishingAllowed } from '../config/config.ts';
import { ITelegramClient } from '../telegram/client.ts';
import {
  AgentExecutionResult,
  AgentMetadata,
  BaseEvent,
  ContentPublishedPayload,
  Env,
  IAgent,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('Agent:Publisher');

export interface PublishRequest {
  contentId: string;
  channelId: string;
  formattedText: string;
  isSimulated?: boolean;
  isManualTest?: boolean;
}

export class PublisherAgent implements IAgent<PublishRequest, ContentPublishedPayload> {
  private telegramClient?: ITelegramClient;
  private env: Partial<Env>;

  public readonly metadata: AgentMetadata = {
    name: 'PublisherAgent',
    role: 'publisher',
    version: '0.1.0-foundation',
    description: 'Formats and publishes approved content to Telegram channels with strict safety guardrails.',
    isAutonomous: false,
    status: 'ready',
  };

  constructor(telegramClient?: ITelegramClient, env?: Partial<Env>) {
    this.telegramClient = telegramClient;
    this.env = env || {};
  }

  public canHandle(event: BaseEvent): boolean {
    return event.type === 'content.approved' || event.type === 'content.scheduled';
  }

  public async execute(
    input: PublishRequest,
    correlationId?: string
  ): Promise<AgentExecutionResult<ContentPublishedPayload>> {
    const startTime = Date.now();
    logger.info('publish_job_started', `Publish request for content ${input.contentId} to ${input.channelId}`, {
      correlationId,
      context: { isManualTest: Boolean(input.isManualTest) },
    });

    // Autonomous safety check: Block automated publishing if test mode is active or not explicitly allowed
    const autonomousAllowed = isAutonomousPublishingAllowed(this.env);
    if (!input.isManualTest && !autonomousAllowed) {
      logger.warn(
        'autonomous_publish_blocked',
        `Autonomous publication for ${input.contentId} was blocked by safety policy (TELEGRAM_TEST_MODE is active or autonomous publishing is disabled).`,
        { correlationId, context: { channelId: input.channelId } }
      );

      return {
        success: false,
        error: 'Autonomous publishing is disabled (TELEGRAM_TEST_MODE is active). Real publication blocked.',
        data: {
          contentId: input.contentId,
          messageId: 0,
          channelId: input.channelId || '@mock_channel',
          publishedAt: Date.now(),
        },
        durationMs: Date.now() - startTime,
        metadata: {
          status: 'blocked_by_safety_policy',
          testModeActive: true,
          autonomousPublishingAllowed: false,
          note: 'Autonomous publishing is blocked while TELEGRAM_TEST_MODE is enabled. Real network call prevented.',
        },
      };
    }

    if (this.telegramClient?.isConfigured() && !input.isSimulated) {
      try {
        const message = await this.telegramClient.sendMessage(input.channelId, input.formattedText, {
          parse_mode: 'Markdown',
        });

        return {
          success: true,
          data: {
            contentId: input.contentId,
            messageId: message.message_id,
            channelId: input.channelId,
            publishedAt: Date.now(),
          },
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        logger.error('publish_failed', `Failed to publish to Telegram channel: ${input.channelId}`, {
          error: err,
        });
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Publish error',
          durationMs: Date.now() - startTime,
        };
      }
    }

    // In foundation/standby mode: return mock success result without making unconfigured network calls
    return {
      success: true,
      data: {
        contentId: input.contentId,
        messageId: 999999,
        channelId: input.channelId || '@mock_channel',
        publishedAt: Date.now(),
      },
      durationMs: Date.now() - startTime,
      metadata: {
        note: 'Simulated publish response (Telegram bot or channel ID not active)',
      },
    };
  }
}
