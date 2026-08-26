/**
 * Autonomous Telegram Channel Manager - Configuration Layer
 *
 * Enforces strong separation between non-sensitive/public settings
 * and secret credentials.
 */

import { Env, PublicConfig, SecretConfig, ValidatedConfig } from '../types/index.ts';
import { ConfigurationError, UnauthorizedError } from '../utils/errors.ts';
import { timingSafeEqual } from '../utils/security.ts';

export const APP_VERSION = '0.1.0-foundation';

/**
 * Check if test mode is enabled (defaults to true for safety).
 * When test mode is enabled:
 * - Autonomous publishing is completely blocked.
 * - PublisherAgent will not publish automated content.
 * - Owner-initiated manual test publication via authenticated /api/admin/telegram/test-publish is permitted.
 */
export function isTestMode(env: Partial<Env>): boolean {
  if (typeof env.TELEGRAM_TEST_MODE === 'boolean') {
    return env.TELEGRAM_TEST_MODE;
  }
  if (typeof env.TELEGRAM_TEST_MODE === 'string') {
    const val = env.TELEGRAM_TEST_MODE.trim().toLowerCase();
    if (val === 'false' || val === '0' || val === 'no') {
      return false;
    }
    return true;
  }
  // Default to test mode active for all environments unless explicitly set to false
  return true;
}

/**
 * Check if autonomous/scheduled publishing is permitted.
 * Fail-closed safety guard:
 * - Returns FALSE if test mode is active (default).
 * - Returns FALSE in non-production environments.
 * - Returns FALSE if bot token or channel ID is missing.
 * - Requires explicit production flags in future phases.
 */
export function isAutonomousPublishingAllowed(env: Partial<Env>): boolean {
  if (!env) return false;
  // If test mode is enabled, autonomous publishing is strictly forbidden
  if (isTestMode(env)) {
    return false;
  }
  // Non-production environments cannot autonomously publish
  if (env.ENVIRONMENT !== 'production') {
    return false;
  }
  // Cannot publish if credentials or target channel are absent
  if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN.trim().length === 0) {
    return false;
  }
  if (!env.TELEGRAM_CHANNEL_ID || env.TELEGRAM_CHANNEL_ID.trim().length === 0) {
    return false;
  }
  return true;
}

/**
 * Extract non-sensitive public configuration
 */
export function getPublicConfig(env: Partial<Env>, reqUrl?: string): PublicConfig {
  const testMode = isTestMode(env);
  const channelId = env.TELEGRAM_CHANNEL_ID?.trim();
  let appUrl = env.APP_URL?.trim() || '';

  // Gracefully derive appUrl from the active request URL if APP_URL was not explicitly set in bindings
  if (!appUrl && reqUrl) {
    try {
      const parsed = new URL(reqUrl);
      appUrl = parsed.origin;
    } catch {
      // Ignore invalid URL
    }
  }

  return {
    environment: env.ENVIRONMENT || 'development',
    logLevel: env.LOG_LEVEL || 'info',
    appUrl,
    channelId: channelId || undefined,
    channelIdConfigured: Boolean(channelId && channelId.length > 0),
    telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN.trim().length > 0),
    geminiConfigured: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0),
    adminAuthEnabled: Boolean(env.ADMIN_SECRET && env.ADMIN_SECRET.trim().length > 0),
    testMode,
    version: APP_VERSION,
  };
}

/**
 * Extract secret configuration for internal service use only.
 * MUST NEVER be returned via HTTP endpoints.
 */
export function getSecretConfig(env: Partial<Env>): SecretConfig {
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim(),
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim(),
    geminiApiKey: env.GEMINI_API_KEY?.trim(),
    telegramChannelId: env.TELEGRAM_CHANNEL_ID?.trim(),
    adminSecret: env.ADMIN_SECRET?.trim(),
    testMode: isTestMode(env),
  };
}

/**
 * Validate configuration and check for missing required variables.
 * In development/test mode, missing secrets are marked for graceful degradation.
 * In production mode, required secrets can be strictly enforced where appropriate.
 */
export function validateConfig(env: Partial<Env>, strictProduction = false): ValidatedConfig {
  const publicConfig = getPublicConfig(env);
  const secretConfig = getSecretConfig(env);

  const missingRequirements: string[] = [];

  if (strictProduction || publicConfig.environment === 'production') {
    if (!secretConfig.telegramBotToken) {
      missingRequirements.push('TELEGRAM_BOT_TOKEN');
    }
    if (!secretConfig.geminiApiKey) {
      missingRequirements.push('GEMINI_API_KEY');
    }
  }

  if (missingRequirements.length > 0) {
    throw new ConfigurationError(
      `Missing required configuration bindings: ${missingRequirements.join(', ')}. Please configure them via Cloudflare Wrangler secrets.`,
      { missing: missingRequirements }
    );
  }

  return {
    public: publicConfig,
    secrets: secretConfig,
  };
}

/**
 * Verify whether an admin request is authorized using ADMIN_SECRET.
 * Uses timingSafeEqual for constant-time comparison to prevent timing attacks.
 */
export function isAuthorizedAdmin(authHeader: string | null | undefined, adminSecret?: string): boolean {
  if (!adminSecret || adminSecret.trim().length === 0) {
    // If no admin secret is set, admin endpoints are disabled for safety
    return false;
  }

  if (!authHeader) {
    return false;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return false;
  }

  const token = parts[1].trim();
  return timingSafeEqual(token, adminSecret.trim());
}

/**
 * Enforce admin authorization on protected endpoints.
 * In production: Strictly requires a valid ADMIN_SECRET Bearer token. Fails closed if ADMIN_SECRET is not configured.
 * In development/test: Requires ADMIN_SECRET if configured. If not configured, permits local development.
 */
export function requireAdminAuth(
  authHeader: string | null | undefined,
  env: Partial<Env>,
  actionName?: string
): void {
  const isDev = env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test';

  if (!env.ADMIN_SECRET || env.ADMIN_SECRET.trim().length === 0) {
    if (isDev) {
      return; // Permitted for local development/test convenience only when ADMIN_SECRET is unset
    }
    throw new UnauthorizedError(
      `ADMIN_SECRET is not configured in production environment bindings (action: ${actionName || 'admin'}).`
    );
  }

  if (!isAuthorizedAdmin(authHeader, env.ADMIN_SECRET)) {
    throw new UnauthorizedError(
      `Valid Bearer ADMIN_SECRET is strictly required to access ${actionName || 'this administrative endpoint'}`
    );
  }
}
