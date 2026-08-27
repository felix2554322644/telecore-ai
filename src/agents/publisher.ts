/**
 * Autonomous Telegram Channel Manager - Publisher Agent
 *
 * Foundation Phase: Interface and placeholder implementation.
 * Coordinates dispatching approved content to Telegram channels.
 */

import { isAutonomousPublishingAllowed } from '../config/config.ts';
import { ProductionControlManager } from '../safety/productionControl.ts';
import { InMemoryStorageAdapter } from '../storage/storage.ts';
import { ITelegramClient } from '../telegram/client.ts';
import {
  AgentExecutionResult,
  AgentMetadata,
  BaseEvent,
  ContentPublishedPayload,
  Env,
  IAgent,
  PrePublicationGateResult,
} from '../types/index.ts';
import { Logger } from '../utils/logger.ts';

const logger = new Logger('Agent:Publisher');

export interface PublishRequest {
  contentId: string;
  channelId: string;
  formattedText: string;
  isSimulated?: boolean;
  isManualTest?: boolean;
  qualityScore?: number;
  confidenceScore?: number;
  factCheckPassed?: boolean;
  claimsVerifiedCount?: number;
  actor?: string;
}

export class PublisherAgent implements IAgent<PublishRequest, ContentPublishedPayload> {
  private telegramClient?: ITelegramClient;
  private env: Partial<Env>;
  private productionControl: ProductionControlManager;

  public readonly metadata: AgentMetadata = {
    name: 'PublisherAgent',
    role: 'publisher',
    version: '0.1.0-foundation',
    description: 'Formats and publishes approved content to Telegram channels with strict safety guardrails and audit logging.',
    isAutonomous: false,
    status: 'ready',
  };

  constructor(
    telegramClient?: ITelegramClient,
    env?: Partial<Env>,
    productionControl?: ProductionControlManager
  ) {
    this.telegramClient = telegramClient;
    this.env = env || {};
    this.productionControl = productionControl || new ProductionControlManager(new InMemoryStorageAdapter(), this.env);
  }

  public setProductionControl(productionControl: ProductionControlManager): void {
    this.productionControl = productionControl;
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

    // 1. Comprehensive Pre-Publication Safeguard Gate (10-point check)
    const gateResult: PrePublicationGateResult = await this.productionControl.evaluatePrePublicationGate({
      contentId: input.contentId,
      channelId: input.channelId,
      formattedText: input.formattedText,
      isManualTest: input.isManualTest,
      qualityScore: input.qualityScore,
      confidenceScore: input.confidenceScore,
      factCheckPassed: input.factCheckPassed,
      claimsVerifiedCount: input.claimsVerifiedCount,
      actor: input.actor,
      correlationId,
    });

    // If any mandatory safeguard failed, block immediately and log
    if (!gateResult.allowed) {
      logger.warn('autonomous_publish_blocked', `Publication for ${input.contentId} BLOCKED: ${gateResult.reason}`, {
        correlationId,
        context: {
          channelId: input.channelId,
          failedChecks: gateResult.checks.filter((c) => c.required && !c.passed).map((c) => c.name),
        },
      });

      return {
        success: false,
        error: `Autonomous publishing is disabled. Publication blocked by production safeguards: ${gateResult.reason}`,
        data: {
          contentId: input.contentId,
          messageId: 0,
          channelId: input.channelId || '@mock_channel',
          publishedAt: Date.now(),
        },
        durationMs: Date.now() - startTime,
        metadata: {
          status: 'blocked_by_safety_policy',
          gateResult,
          testModeActive: true,
          autonomousPublishingAllowed: isAutonomousPublishingAllowed(this.env),
          note: gateResult.reason,
        },
      };
    }

    // 2. Real Telegram Client dispatch when configured and not simulated
    if (this.telegramClient?.isConfigured() && !input.isSimulated) {
      try {
        const message = await this.telegramClient.sendMessage(input.channelId, input.formattedText, {
          parse_mode: 'Markdown',
        });

        // Record successful publication in production control (updates rate limits and audit log)
        await this.productionControl.recordPublicationSuccess(input.channelId, input.contentId, correlationId);

        return {
          success: true,
          data: {
            contentId: input.contentId,
            messageId: message.message_id,
            channelId: input.channelId,
            publishedAt: Date.now(),
          },
          durationMs: Date.now() - startTime,
          metadata: {
            gateResult,
          },
        };
      } catch (err) {
        logger.error('publish_failed', `Failed to publish to Telegram channel: ${input.channelId}`, {
          error: err,
        });
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Publish error',
          durationMs: Date.now() - startTime,
          metadata: { gateResult },
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
        gateResult,
      },
    };
  }
}

