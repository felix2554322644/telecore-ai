import { describe, expect, it } from 'vitest';
import worker from '../src/index.ts';
import { Env } from '../src/types/index.ts';
import { formatSafeErrorResponse } from '../src/utils/errors.ts';
import { LogEntry, Logger, sanitizeLogData } from '../src/utils/logger.ts';

describe('Security & Zero-Leakage Assurances', () => {
  const secretBotToken = '123456789:AAEC8b9C_D9F2G3H4I5J6K7L8M9N0O1P2Q3';
  const secretGeminiKey = 'AIzaSyD-AbcDefGhiJklMnoPqrStuVwxyz12345';
  const secretAdmin = 'ultra_secret_admin_bearer_key_2026';
  const secretWebhook = 'webhook_secret_key_777';

  const mockEnv: Env = {
    TELEGRAM_BOT_TOKEN: secretBotToken,
    TELEGRAM_WEBHOOK_SECRET: secretWebhook,
    GEMINI_API_KEY: secretGeminiKey,
    ADMIN_SECRET: secretAdmin,
    ENVIRONMENT: 'production',
    LOG_LEVEL: 'info',
  };

  it('GET /health must never leak secret tokens in JSON output', async () => {
    const request = new Request('http://localhost/health');
    const response = await worker.fetch(request, mockEnv);
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(bodyText).not.toContain(secretBotToken);
    expect(bodyText).not.toContain(secretGeminiKey);
    expect(bodyText).not.toContain(secretAdmin);
    expect(bodyText).not.toContain(secretWebhook);
  });

  it('GET /api/status must never leak secret tokens in JSON output', async () => {
    const request = new Request('http://localhost/api/status');
    const response = await worker.fetch(request, mockEnv);
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(bodyText).not.toContain(secretBotToken);
    expect(bodyText).not.toContain(secretGeminiKey);
    expect(bodyText).not.toContain(secretAdmin);
    expect(bodyText).not.toContain(secretWebhook);
  });

  it('POST /api/admin/telegram/verify must never leak secret bot token in response', async () => {
    const request = new Request('http://localhost/api/admin/telegram/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretAdmin}`,
      },
    });
    const response = await worker.fetch(request, mockEnv);
    const bodyText = await response.text();

    expect(bodyText).not.toContain(secretBotToken);
    expect(bodyText).not.toContain(secretGeminiKey);
    expect(bodyText).not.toContain(secretAdmin);
    expect(bodyText).not.toContain(secretWebhook);
  });

  it('Protected endpoints must reject unauthorized access in production', async () => {
    const request = new Request('http://localhost/api/admin/incidents');
    const response = await worker.fetch(request, mockEnv);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('Logger must redact sensitive bot tokens, API keys, and authorization headers', () => {
    const capturedEntries: LogEntry[] = [];
    const logger = new Logger('TestLogger', 'debug', (entry) => capturedEntries.push(entry));

    logger.info('test_event', `Connected to bot with token ${secretBotToken} and key ${secretGeminiKey}`, {
      context: {
        authorization: `Bearer ${secretAdmin}`,
        token: secretBotToken,
        apiKey: secretGeminiKey,
        nested: {
          secret: secretWebhook,
        },
      },
    });

    expect(capturedEntries.length).toBe(1);
    const entryJson = JSON.stringify(capturedEntries[0]);

    expect(entryJson).not.toContain(secretBotToken);
    expect(entryJson).not.toContain(secretGeminiKey);
    expect(entryJson).not.toContain(secretAdmin);
    expect(entryJson).not.toContain(secretWebhook);
    expect(entryJson).toContain('[REDACTED_SECRET]');
  });

  it('formatSafeErrorResponse must omit stack traces and internal secrets in production', () => {
    const dangerousError = new Error(`Connection failed with token: ${secretBotToken}`);
    const safeResponse = formatSafeErrorResponse(dangerousError, 'production');

    expect(safeResponse.error.statusCode).toBe(500);
    expect(safeResponse.error.message).not.toContain(secretBotToken);
    expect((safeResponse.error as any).stack).toBeUndefined();
  });
});
