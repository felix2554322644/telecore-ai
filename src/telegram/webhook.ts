/**
 * Autonomous Telegram Channel Manager - Webhook Handler
 *
 * Handles incoming updates from Telegram Bot API webhooks.
 * Validates authenticity, parses updates, logs safely, and dispatches to the Orchestrator.
 */

import { TelegramUpdate, TelegramUpdateSummary } from '../types/index.ts';
import { WebhookValidationError } from '../utils/errors.ts';
import { Logger } from '../utils/logger.ts';
import { timingSafeEqual } from '../utils/security.ts';

const logger = new Logger('TelegramWebhook');

export interface WebhookValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface IOrchestratorDispatcher {
  publish(eventType: any, payload: unknown, correlationId?: string): Promise<any>;
}

export class TelegramWebhookHandler {
  private webhookSecret?: string;
  private orchestrator?: IOrchestratorDispatcher;

  constructor(webhookSecret?: string, orchestrator?: IOrchestratorDispatcher) {
    this.webhookSecret = webhookSecret?.trim();
    this.orchestrator = orchestrator;
  }

  /**
   * Validate the incoming X-Telegram-Bot-Api-Secret-Token header in constant time
   */
  public validateSecretToken(secretHeader: string | null | undefined): WebhookValidationResult {
    // If no webhook secret is configured on the server, allow in dev/test mode
    if (!this.webhookSecret || this.webhookSecret.length === 0) {
      return { isValid: true };
    }

    if (!secretHeader) {
      return {
        isValid: false,
        reason: 'Missing X-Telegram-Bot-Api-Secret-Token header',
      };
    }

    if (!timingSafeEqual(secretHeader.trim(), this.webhookSecret)) {
      return {
        isValid: false,
        reason: 'Invalid webhook secret token',
      };
    }

    return { isValid: true };
  }

  /**
   * Parse raw incoming body into TelegramUpdate
   */
  public parseUpdate(body: unknown): TelegramUpdate {
    if (!body || typeof body !== 'object') {
      throw new WebhookValidationError('Invalid webhook body: expected a JSON object');
    }

    const payload = body as Record<string, unknown>;
    if (typeof payload.update_id !== 'number') {
      throw new WebhookValidationError('Malformed Telegram update: missing update_id');
    }

    return payload as unknown as TelegramUpdate;
  }

  /**
   * Extract safe summary from update for logging and monitoring
   */
  public extractSummary(update: TelegramUpdate): TelegramUpdateSummary {
    let updateType: TelegramUpdateSummary['updateType'] = 'unknown';
    let msg = update.message;

    if (update.message) {
      updateType = 'message';
      msg = update.message;
    } else if (update.channel_post) {
      updateType = 'channel_post';
      msg = update.channel_post;
    } else if (update.edited_message) {
      updateType = 'edited_message';
      msg = update.edited_message;
    } else if (update.edited_channel_post) {
      updateType = 'edited_channel_post';
      msg = update.edited_channel_post;
    }

    return {
      updateId: update.update_id,
      updateType,
      timestamp: msg ? msg.date * 1000 : Date.now(),
      chatId: msg?.chat?.id,
      chatType: msg?.chat?.type,
      chatTitle: msg?.chat?.title || msg?.chat?.username,
      hasText: Boolean(msg?.text || msg?.caption),
    };
  }

  /**
   * Process incoming webhook request and emit orchestrator event
   */
  public async handleWebhook(
    secretHeader: string | null | undefined,
    body: unknown
  ): Promise<{ ok: boolean; updateId?: number; summary?: TelegramUpdateSummary }> {
    const validation = this.validateSecretToken(secretHeader);
    if (!validation.isValid) {
      logger.warn('webhook_validation_failed', validation.reason);
      throw new WebhookValidationError(validation.reason || 'Unauthorized webhook request');
    }

    const update = this.parseUpdate(body);
    const summary = this.extractSummary(update);

    logger.info('telegram_update_received', `Received Telegram update #${update.update_id} (${summary.updateType})`, {
      context: {
        updateId: update.update_id,
        updateType: summary.updateType,
        chatId: summary.chatId,
        chatType: summary.chatType,
      },
    });

    if (this.orchestrator) {
      await this.orchestrator.publish(
        'telegram.update.received',
        { update, summary },
        `update-${update.update_id}`
      );
      await this.orchestrator.publish(
        'webhook.received',
        update,
        `update-${update.update_id}`
      );
    }

    return {
      ok: true,
      updateId: update.update_id,
      summary,
    };
  }
}
