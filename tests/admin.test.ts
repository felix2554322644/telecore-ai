import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import { Env } from '../src/types/index.ts';

describe('Admin Endpoints & Security', () => {
  const baseEnv: Env = {
    TELEGRAM_BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    TELEGRAM_WEBHOOK_SECRET: 'super_webhook_sec_123',
    GEMINI_API_KEY: 'mock_gemini_key',
    TELEGRAM_CHANNEL_ID: '@test_channel',
    ADMIN_SECRET: 'correct_admin_secret_999',
    ENVIRONMENT: 'production', // strict auth checks in production
    APP_URL: 'https://telecore-worker.workers.dev',
    TELEGRAM_TEST_MODE: 'true',
  };

  it('should reject test-publish if ADMIN_SECRET is missing or invalid', async () => {
    const request = new Request('https://telecore.internal/api/admin/telegram/test-publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong_secret',
      },
      body: JSON.stringify({ message: 'Unauthorized test post' }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.message).toContain('ADMIN_SECRET');
  });

  it('should reject test-publish if message is empty', async () => {
    const request = new Request('https://telecore.internal/api/admin/telegram/test-publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer correct_admin_secret_999',
      },
      body: JSON.stringify({ message: '   ' }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('cannot be empty');
  });

  it('should reject test-publish if message exceeds 4096 characters', async () => {
    const longMessage = 'A'.repeat(4097);
    const request = new Request('https://telecore.internal/api/admin/telegram/test-publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer correct_admin_secret_999',
      },
      body: JSON.stringify({ message: longMessage }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('4096');
  });

  it('should reject setup-webhook with localhost or non-https URLs', async () => {
    const request = new Request('https://telecore.internal/api/admin/telegram/setup-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer correct_admin_secret_999',
      },
      body: JSON.stringify({ webhookUrl: 'http://localhost:3000/webhooks/telegram' }),
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('HTTPS');
  });

  it('should reject GET /api/admin/run-test with invalid or missing secret', async () => {
    // Missing secret
    const reqMissing = new Request('https://telecore.internal/api/admin/run-test', {
      method: 'GET',
    });
    const resMissing = await worker.fetch(reqMissing, baseEnv);
    expect(resMissing.status).toBe(401);

    // Invalid secret
    const reqInvalid = new Request('https://telecore.internal/api/admin/run-test?secret=wrong_secret', {
      method: 'GET',
    });
    const resInvalid = await worker.fetch(reqInvalid, baseEnv);
    expect(resInvalid.status).toBe(401);
  });

  it('should execute pipeline test on GET /api/admin/run-test with valid secret query parameter', async () => {
    const request = new Request('https://telecore.internal/api/admin/run-test?secret=correct_admin_secret_999', {
      method: 'GET',
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.testModeActive).toBe(true);
    expect(data.autonomousPublishingAllowed).toBe(false);
    expect(data.event.type).toBe('research.requested');
    expect(data.orchestrator.processedEventsCount).toBeGreaterThanOrEqual(1);
  });

  it('should reject GET /api/admin/manual-test-publish with missing secret', async () => {
    const request = new Request('https://telecore.internal/api/admin/manual-test-publish', {
      method: 'GET',
    });
    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(401);
  });

  it('should reject GET /api/admin/manual-test-publish with invalid secret', async () => {
    const request = new Request('https://telecore.internal/api/admin/manual-test-publish?secret=wrong_secret', {
      method: 'GET',
    });
    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(401);
  });

  it('should invoke existing manual test-publish mechanism on GET /api/admin/manual-test-publish with valid secret', async () => {
    const mockTelegramMessage = {
      message_id: 999123,
      date: Math.floor(Date.now() / 1000),
      chat: { id: -100123456, type: 'channel', title: 'Tech+ AI Channel', username: 'techpluseai' },
      text: '🚀 TeleCore AI Verification Test\n\nAll systems operational.\nMode: Controlled Owner Test.',
    };

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/sendMessage')) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        expect(body.chat_id).toBe('@test_channel');
        expect(body.text).toContain('🚀 TeleCore AI Verification Test');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, result: mockTelegramMessage }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    globalThis.fetch = fetchSpy as any;

    try {
      const request = new Request(
        'https://telecore.internal/api/admin/manual-test-publish?secret=correct_admin_secret_999',
        { method: 'GET' }
      );

      const response = await worker.fetch(request, baseEnv);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.messageId).toBe(999123);
      expect(data.channel).toBe('Tech+ AI Channel');
      expect(data.publishedAt).toBeDefined();
      // Ensure no sensitive tokens or secrets are leaked
      expect(data.ADMIN_SECRET).toBeUndefined();
      expect(data.TELEGRAM_BOT_TOKEN).toBeUndefined();
      expect(data.GEMINI_API_KEY).toBeUndefined();
      expect(data.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
      // Verify exactly one sendMessage call was made
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
