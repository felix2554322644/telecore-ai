import { describe, expect, it } from 'vitest';
import { getPublicConfig, getSecretConfig, isAuthorizedAdmin, validateConfig } from '../src/config/config.ts';
import { Env } from '../src/types/index.ts';
import { ConfigurationError } from '../src/utils/errors.ts';

describe('Configuration Layer', () => {
  it('should isolate non-sensitive public configuration from secrets', () => {
    const rawEnv: Partial<Env> = {
      TELEGRAM_BOT_TOKEN: 'secret_token_12345',
      TELEGRAM_WEBHOOK_SECRET: 'webhook_secret_999',
      GEMINI_API_KEY: 'gemini_secret_key_888',
      ADMIN_SECRET: 'admin_secret_super_secure',
      TELEGRAM_CHANNEL_ID: '@ai_tech_news',
      ENVIRONMENT: 'production',
      LOG_LEVEL: 'warn',
      APP_URL: 'https://channel-manager.workers.dev',
    };

    const publicConfig = getPublicConfig(rawEnv);
    const secretConfig = getSecretConfig(rawEnv);

    // Public config must ONLY contain boolean flags and non-sensitive strings
    expect(publicConfig.environment).toBe('production');
    expect(publicConfig.logLevel).toBe('warn');
    expect(publicConfig.appUrl).toBe('https://channel-manager.workers.dev');
    expect(publicConfig.telegramConfigured).toBe(true);
    expect(publicConfig.geminiConfigured).toBe(true);
    expect(publicConfig.channelIdConfigured).toBe(true);
    expect(publicConfig.adminAuthEnabled).toBe(true);

    // Assert that NO raw secrets exist in publicConfig
    const publicJson = JSON.stringify(publicConfig);
    expect(publicJson).not.toContain('secret_token_12345');
    expect(publicJson).not.toContain('webhook_secret_999');
    expect(publicJson).not.toContain('gemini_secret_key_888');
    expect(publicJson).not.toContain('admin_secret_super_secure');

    // Secret config contains the values for internal handlers
    expect(secretConfig.telegramBotToken).toBe('secret_token_12345');
    expect(secretConfig.geminiApiKey).toBe('gemini_secret_key_888');
  });

  it('should enforce required secrets in strict production mode', () => {
    const emptyEnv: Partial<Env> = {
      ENVIRONMENT: 'production',
    };

    expect(() => validateConfig(emptyEnv, true)).toThrow(ConfigurationError);
  });

  it('should allow partial configuration in development mode', () => {
    const devEnv: Partial<Env> = {
      ENVIRONMENT: 'development',
    };

    const validated = validateConfig(devEnv, false);
    expect(validated.public.environment).toBe('development');
    expect(validated.public.telegramConfigured).toBe(false);
  });

  it('should securely validate Bearer admin tokens', () => {
    const secret = 'ultra_safe_admin_token_2026';

    expect(isAuthorizedAdmin('Bearer ultra_safe_admin_token_2026', secret)).toBe(true);
    expect(isAuthorizedAdmin('bearer ultra_safe_admin_token_2026', secret)).toBe(true);
    expect(isAuthorizedAdmin('Bearer wrong_token', secret)).toBe(false);
    expect(isAuthorizedAdmin('Basic xyz', secret)).toBe(false);
    expect(isAuthorizedAdmin(null, secret)).toBe(false);
    expect(isAuthorizedAdmin('Bearer ultra_safe_admin_token_2026', undefined)).toBe(false);
  });

  it('should dynamically derive appUrl from incoming request origin if APP_URL is not set', () => {
    const envWithoutAppUrl: Partial<Env> = {
      ENVIRONMENT: 'production',
      TELEGRAM_CHANNEL_ID: '@dynamic_channel',
    };

    const publicConfig = getPublicConfig(envWithoutAppUrl, 'https://telecore-ai.workers.dev/api/status');
    expect(publicConfig.appUrl).toBe('https://telecore-ai.workers.dev');
    expect(publicConfig.channelId).toBe('@dynamic_channel');
    expect(publicConfig.channelIdConfigured).toBe(true);
  });
});
