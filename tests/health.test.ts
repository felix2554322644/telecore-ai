import { describe, expect, it, vi } from 'vitest';
import { GeminiService } from '../src/ai/gemini.ts';
import { HealthService } from '../src/health/health.ts';
import { InMemoryStorageAdapter } from '../src/storage/storage.ts';
import { TelegramClient } from '../src/telegram/client.ts';
import { Env } from '../src/types/index.ts';

describe('Health Service', () => {
  it('should generate a structured health report with all subsystems', async () => {
    const healthService = new HealthService();
    const storage = new InMemoryStorageAdapter();
    const gemini = new GeminiService('test_gemini_key');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { id: 12345, is_bot: true, username: 'test_bot' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const telegram = new TelegramClient('123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ', mockFetch as any);

    const env: Partial<Env> = {
      ENVIRONMENT: 'test',
      TELEGRAM_CHANNEL_ID: '@test_channel',
    };

    const report = await healthService.getHealthReport(env, storage, gemini, telegram);

    expect(report).toBeDefined();
    expect(report.status).toBe('healthy');
    expect(report.environment).toBe('test');
    expect(report.version).toBeDefined();
    expect(typeof report.uptimeSeconds).toBe('number');
    expect(report.dependencies).toBeDefined();

    // Check dependency details
    expect(report.dependencies.storage.status).toBe('healthy');
    expect(report.dependencies.storage.critical).toBe(true);

    expect(report.dependencies.telegram.status).toBe('healthy');
    expect(report.dependencies.gemini.status).toBe('healthy');
  });

  it('should mark health as degraded when optional tokens are not set', async () => {
    const healthService = new HealthService();
    const storage = new InMemoryStorageAdapter();
    const gemini = new GeminiService(undefined);
    const telegram = new TelegramClient(undefined);

    const report = await healthService.getHealthReport({ ENVIRONMENT: 'development' }, storage, gemini, telegram);

    expect(report.status).toBe('degraded');
    expect(report.dependencies.telegram.status).toBe('degraded');
    expect(report.dependencies.gemini.status).toBe('degraded');
    // Storage is still healthy
    expect(report.dependencies.storage.status).toBe('healthy');
  });
});
