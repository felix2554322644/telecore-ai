/**
 * Autonomous Telegram Channel Manager - Health Service
 *
 * Implements structured JSON health reports for monitoring and observability.
 */

import { IGeminiService } from '../ai/gemini.ts';
import { APP_VERSION } from '../config/config.ts';
import { ITelegramClient } from '../telegram/client.ts';
import { DependencyHealth, Env, HealthReport, HealthStatus, IStorage } from '../types/index.ts';

const processStartTime = Date.now();

export class HealthService {
  /**
   * Evaluate overall health across storage, telegram, and AI subsystems
   */
  public async getHealthReport(
    env: Partial<Env>,
    storage: IStorage,
    gemini: IGeminiService,
    telegram: ITelegramClient
  ): Promise<HealthReport> {
    const dependencies: Record<string, DependencyHealth> = {};

    // 1. Storage check
    const storageStart = Date.now();
    try {
      const testKey = `health_ping_${Date.now()}`;
      await storage.set(testKey, { ping: 'ok' }, { expirationTtl: 60 });
      const readVal = await storage.get<{ ping: string }>(testKey);
      await storage.delete(testKey);

      dependencies.storage = {
        name: 'storage',
        status: readVal?.ping === 'ok' ? 'healthy' : 'degraded',
        critical: true,
        latencyMs: Date.now() - storageStart,
        message: 'Storage read/write operational',
        lastChecked: Date.now(),
      };
    } catch (err) {
      dependencies.storage = {
        name: 'storage',
        status: 'unhealthy',
        critical: true,
        latencyMs: Date.now() - storageStart,
        message: `Storage check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        lastChecked: Date.now(),
      };
    }

    // 2. Telegram client & bot identity check
    const telegramStart = Date.now();
    if (!telegram.isConfigured()) {
      dependencies.telegram = {
        name: 'telegram',
        status: 'degraded',
        critical: false,
        message: 'TELEGRAM_BOT_TOKEN not configured (bot adapter in standby)',
        lastChecked: telegramStart,
      };
    } else {
      try {
        const botUser = await telegram.getMe();
        dependencies.telegram = {
          name: 'telegram',
          status: 'healthy',
          critical: false,
          latencyMs: Date.now() - telegramStart,
          message: `Connected as @${botUser.username || botUser.first_name} (ID: ${botUser.id})`,
          lastChecked: Date.now(),
        };
      } catch (err) {
        dependencies.telegram = {
          name: 'telegram',
          status: 'degraded',
          critical: false,
          latencyMs: Date.now() - telegramStart,
          message: `Telegram API check warning: ${err instanceof Error ? err.message : 'Unknown'}`,
          lastChecked: Date.now(),
        };
      }
    }

    // 3. Channel configuration check
    const channelId = env.TELEGRAM_CHANNEL_ID?.trim();
    dependencies.channel = {
      name: 'channel',
      status: channelId && channelId.length > 0 ? 'healthy' : 'degraded',
      critical: false,
      message: channelId && channelId.length > 0
        ? `Target channel configured (${channelId})`
        : 'TELEGRAM_CHANNEL_ID not set',
      lastChecked: Date.now(),
    };

    // 4. Gemini check
    dependencies.gemini = await gemini.checkHealth();

    // Calculate overall status
    let overallStatus: HealthStatus = 'healthy';
    for (const dep of Object.values(dependencies)) {
      if (dep.status === 'unhealthy' && dep.critical) {
        overallStatus = 'unhealthy';
        break;
      }
      if (dep.status === 'degraded' || dep.status === 'unhealthy') {
        overallStatus = 'degraded';
      }
    }

    return {
      status: overallStatus,
      environment: env.ENVIRONMENT || 'development',
      version: APP_VERSION,
      timestamp: Date.now(),
      uptimeSeconds: Math.floor((Date.now() - processStartTime) / 1000),
      dependencies,
    };
  }
}
