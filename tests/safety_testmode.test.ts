import { describe, expect, it, vi } from 'vitest';
import { PublisherAgent } from '../src/agents/publisher.ts';
import { isAutonomousPublishingAllowed, isTestMode, requireAdminAuth } from '../src/config/config.ts';
import worker from '../src/index.ts';
import { ITelegramClient } from '../src/telegram/client.ts';
import { Env } from '../src/types/index.ts';
import { UnauthorizedError } from '../src/utils/errors.ts';

describe('Safety Model & Test Mode Isolation', () => {
  const fullProductionEnv: Env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_WEBHOOK_SECRET: 'super_webhook_sec_123',
    GEMINI_API_KEY: 'mock_gemini_key',
    TELEGRAM_CHANNEL_ID: '@test_channel',
    ADMIN_SECRET: 'correct_admin_secret_999',
    ENVIRONMENT: 'production',
    APP_URL: 'https://telecore-ai.workers.dev',
    TELEGRAM_TEST_MODE: 'true',
  };

  describe('isTestMode and isAutonomousPublishingAllowed', () => {
    it('defaults to test mode when TELEGRAM_TEST_MODE is undefined or true', () => {
      expect(isTestMode({})).toBe(true);
      expect(isTestMode({ TELEGRAM_TEST_MODE: 'true' })).toBe(true);
      expect(isTestMode({ TELEGRAM_TEST_MODE: 'TRUE' })).toBe(true);
      expect(isTestMode({ TELEGRAM_TEST_MODE: '1' })).toBe(true);
      expect(isTestMode({ TELEGRAM_TEST_MODE: 'false' })).toBe(false);
    });

    it('blocks autonomous publishing when TELEGRAM_TEST_MODE is active', () => {
      expect(isAutonomousPublishingAllowed({ ...fullProductionEnv, TELEGRAM_TEST_MODE: 'true' })).toBe(false);
      expect(isAutonomousPublishingAllowed({ ...fullProductionEnv, TELEGRAM_TEST_MODE: undefined })).toBe(false);
    });

    it('blocks autonomous publishing in non-production environments even if test mode is false', () => {
      expect(isAutonomousPublishingAllowed({
        ...fullProductionEnv,
        ENVIRONMENT: 'development',
        TELEGRAM_TEST_MODE: 'false',
      })).toBe(false);
    });

    it('blocks autonomous publishing if credentials or channel ID are missing', () => {
      expect(isAutonomousPublishingAllowed({
        ...fullProductionEnv,
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_TEST_MODE: 'false',
      })).toBe(false);
      expect(isAutonomousPublishingAllowed({
        ...fullProductionEnv,
        TELEGRAM_CHANNEL_ID: '',
        TELEGRAM_TEST_MODE: 'false',
      })).toBe(false);
    });

    it('allows autonomous publishing only when production, credentials present, and TELEGRAM_TEST_MODE is explicitly false', () => {
      expect(isAutonomousPublishingAllowed({
        ...fullProductionEnv,
        ENVIRONMENT: 'production',
        TELEGRAM_TEST_MODE: 'false',
      })).toBe(true);
    });
  });

  describe('PublisherAgent Guard', () => {
    it('PublisherAgent blocks autonomous publication when TELEGRAM_TEST_MODE is active', async () => {
      const mockSendMessage = vi.fn();
      const mockTelegramClient: ITelegramClient = {
        isConfigured: () => true,
        getMe: vi.fn(),
        sendMessage: mockSendMessage,
        getChat: vi.fn(),
        getChatMember: vi.fn(),
        getChatAdministrators: vi.fn(),
        setWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
        getWebhookInfo: vi.fn(),
        verifyChannelAccess: vi.fn(),
      };

      const publisher = new PublisherAgent(mockTelegramClient, {
        ...fullProductionEnv,
        TELEGRAM_TEST_MODE: 'true',
      });

      const result = await publisher.execute({
        contentId: 'draft_001',
        channelId: '@test_channel',
        formattedText: 'This should not be autonomously published',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Autonomous publishing is disabled');
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('PublisherAgent blocks autonomous publication when env is omitted (fail-closed default)', async () => {
      const mockSendMessage = vi.fn();
      const mockTelegramClient: ITelegramClient = {
        isConfigured: () => true,
        getMe: vi.fn(),
        sendMessage: mockSendMessage,
        getChat: vi.fn(),
        getChatMember: vi.fn(),
        getChatAdministrators: vi.fn(),
        setWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
        getWebhookInfo: vi.fn(),
        verifyChannelAccess: vi.fn(),
      };

      const publisher = new PublisherAgent(mockTelegramClient);

      const result = await publisher.execute({
        contentId: 'draft_002',
        channelId: '@test_channel',
        formattedText: 'Fail closed test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Autonomous publishing is disabled');
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Owner-Initiated Test Publication Endpoint', () => {
    it('allows owner-authenticated test publication even when TELEGRAM_TEST_MODE=true', async () => {
      const mockMessage = {
        message_id: 888,
        date: Math.floor(Date.now() / 1000),
        chat: { id: -100123456, type: 'channel', title: 'TeleCore Channel' },
        text: 'Explicit owner test publish',
      };

      // Mock global fetch for Telegram API inside worker
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/sendMessage')) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true, result: mockMessage }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }) as any;

      try {
        const request = new Request('https://telecore.internal/api/admin/telegram/test-publish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer correct_admin_secret_999',
          },
          body: JSON.stringify({
            message: 'Explicit owner test publish',
          }),
        });

        const response = await worker.fetch(request, fullProductionEnv);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.ok).toBe(true);
        expect(data.manualTest).toBe(true);
        expect(data.isOwnerInitiated).toBe(true);
        expect(data.testModeActive).toBe(true);
        expect(data.result.messageId).toBe(888);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('rejects test-publish if ADMIN_SECRET is wrong or missing', async () => {
      const request = new Request('https://telecore.internal/api/admin/telegram/test-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid_secret',
        },
        body: JSON.stringify({ message: 'Test message' }),
      });

      const response = await worker.fetch(request, fullProductionEnv);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.message).toContain('ADMIN_SECRET');
    });
  });

  describe('requireAdminAuth Helper', () => {
    it('throws UnauthorizedError in production when ADMIN_SECRET is not configured', () => {
      expect(() => {
        requireAdminAuth('Bearer some_key', { ENVIRONMENT: 'production' }, 'do admin action');
      }).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when authHeader is missing or invalid', () => {
      expect(() => {
        requireAdminAuth(null, fullProductionEnv, 'do admin action');
      }).toThrow(UnauthorizedError);

      expect(() => {
        requireAdminAuth('Bearer wrong_secret', fullProductionEnv, 'do admin action');
      }).toThrow(UnauthorizedError);
    });

    it('succeeds when valid Bearer ADMIN_SECRET is provided', () => {
      expect(() => {
        requireAdminAuth('Bearer correct_admin_secret_999', fullProductionEnv, 'do admin action');
      }).not.toThrow();
    });
  });
});
