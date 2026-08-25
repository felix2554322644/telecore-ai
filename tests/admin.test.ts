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
});
