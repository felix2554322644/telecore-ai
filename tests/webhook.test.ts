import { describe, expect, it, vi } from 'vitest';
import { TelegramWebhookHandler } from '../src/telegram/webhook.ts';
import { WebhookValidationError } from '../src/utils/errors.ts';

describe('Telegram Webhook Handler', () => {
  it('should validate X-Telegram-Bot-Api-Secret-Token correctly', () => {
    const handler = new TelegramWebhookHandler('valid_secret_999');

    expect(handler.validateSecretToken('valid_secret_999').isValid).toBe(true);
    expect(handler.validateSecretToken('wrong_secret').isValid).toBe(false);
    expect(handler.validateSecretToken(null).isValid).toBe(false);
    expect(handler.validateSecretToken(undefined).isValid).toBe(false);
  });

  it('should parse valid Telegram updates and dispatch to orchestrator', async () => {
    const mockOrchestrator = {
      publish: vi.fn().mockResolvedValue({ id: 'evt_1' }),
    };

    const handler = new TelegramWebhookHandler('sec_123', mockOrchestrator);

    const validPayload = {
      update_id: 10001,
      message: {
        message_id: 55,
        date: 1700000000,
        chat: { id: 12345, type: 'private', first_name: 'Editor' },
        text: '/status',
      },
    };

    const response = await handler.handleWebhook('sec_123', validPayload);

    expect(response.ok).toBe(true);
    expect(response.updateId).toBe(10001);
    expect(response.summary?.updateType).toBe('message');
    expect(response.summary?.chatId).toBe(12345);
    expect(mockOrchestrator.publish).toHaveBeenCalledWith(
      'telegram.update.received',
      { update: validPayload, summary: response.summary },
      'update-10001'
    );
    expect(mockOrchestrator.publish).toHaveBeenCalledWith(
      'webhook.received',
      validPayload,
      'update-10001'
    );
  });

  it('should parse channel_post updates and extract correct metadata', async () => {
    const mockOrchestrator = {
      publish: vi.fn().mockResolvedValue({ id: 'evt_2' }),
    };

    const handler = new TelegramWebhookHandler('sec_123', mockOrchestrator);

    const channelPostPayload = {
      update_id: 20002,
      channel_post: {
        message_id: 101,
        date: 1700000500,
        chat: { id: -100999888, type: 'channel', title: 'Tech AI Insights' },
        text: 'New article released!',
      },
    };

    const response = await handler.handleWebhook('sec_123', channelPostPayload);

    expect(response.ok).toBe(true);
    expect(response.summary?.updateType).toBe('channel_post');
    expect(response.summary?.chatId).toBe(-100999888);
    expect(response.summary?.chatTitle).toBe('Tech AI Insights');
    expect(response.summary?.hasText).toBe(true);
  });

  it('should reject updates with missing or invalid secret token', async () => {
    const handler = new TelegramWebhookHandler('sec_123');

    await expect(
      handler.handleWebhook('invalid_token', { update_id: 123 })
    ).rejects.toThrow(WebhookValidationError);
  });

  it('should reject malformed update bodies lacking update_id', async () => {
    const handler = new TelegramWebhookHandler('sec_123');

    await expect(
      handler.handleWebhook('sec_123', { invalid: 'payload' })
    ).rejects.toThrow(WebhookValidationError);
  });
});
