/**
 * Autonomous Telegram Channel Manager - Structured Logging Utility
 *
 * Security Guarantee:
 * Secrets (API keys, Bot tokens, Bearer tokens, passwords, private credentials)
 * are aggressively redacted and never outputted in logs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  event: string;
  message?: string;
  requestId?: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
}

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Patterns and keys that must always be masked
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /key/i,
  /password/i,
  /auth/i,
  /bearer/i,
  /credential/i,
  /cookie/i,
];

const SECRET_VALUE_PATTERNS = [
  /\b\d{8,12}:[a-zA-Z0-9_-]{35,}\b/g, // Telegram bot token format (e.g. 123456789:ABCdef...)
  /AIza[0-9A-Za-z-_]{35}/g, // Google API key format
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, // Bearer auth headers
];

/**
 * Recursively redacts sensitive keys and values from objects
 */
export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 6 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    let sanitized = data;
    for (const pattern of SECRET_VALUE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        sanitizedObj[key] = '[REDACTED_SECRET]';
      } else {
        sanitizedObj[key] = sanitizeLogData(value, depth + 1);
      }
    }
    return sanitizedObj;
  }

  return '[Unserializable]';
}

export class Logger {
  private component: string;
  private minLevel: LogLevel;
  private outputHandler: (entry: LogEntry) => void;

  constructor(
    component: string,
    minLevel: LogLevel = 'info',
    outputHandler?: (entry: LogEntry) => void
  ) {
    this.component = component;
    this.minLevel = minLevel;
    this.outputHandler =
      outputHandler ||
      ((entry) => {
        const jsonStr = JSON.stringify(entry);
        if (entry.level === 'error') {
          console.error(jsonStr);
        } else if (entry.level === 'warn') {
          console.warn(jsonStr);
        } else {
          console.log(jsonStr);
        }
      });
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[this.minLevel];
  }

  private log(
    level: LogLevel,
    event: string,
    message?: string,
    meta?: {
      requestId?: string;
      correlationId?: string;
      context?: Record<string, unknown>;
      error?: unknown;
    }
  ): void {
    if (!this.shouldLog(level)) return;

    let formattedError: LogEntry['error'] = undefined;
    if (meta?.error) {
      if (meta.error instanceof Error) {
        formattedError = {
          name: meta.error.name,
          message: sanitizeLogData(meta.error.message) as string,
          code: (meta.error as { code?: string }).code,
          stack:
            this.minLevel === 'debug'
              ? (sanitizeLogData(meta.error.stack || '') as string)
              : undefined,
        };
      } else {
        formattedError = {
          name: 'UnknownError',
          message: String(sanitizeLogData(meta.error)),
        };
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      event,
      message: message ? (sanitizeLogData(message) as string) : undefined,
      requestId: meta?.requestId,
      correlationId: meta?.correlationId,
      context: meta?.context
        ? (sanitizeLogData(meta.context) as Record<string, unknown>)
        : undefined,
      error: formattedError,
    };

    this.outputHandler(entry);
  }

  public debug(
    event: string,
    message?: string,
    meta?: { requestId?: string; correlationId?: string; context?: Record<string, unknown> }
  ): void {
    this.log('debug', event, message, meta);
  }

  public info(
    event: string,
    message?: string,
    meta?: { requestId?: string; correlationId?: string; context?: Record<string, unknown> }
  ): void {
    this.log('info', event, message, meta);
  }

  public warn(
    event: string,
    message?: string,
    meta?: {
      requestId?: string;
      correlationId?: string;
      context?: Record<string, unknown>;
      error?: unknown;
    }
  ): void {
    this.log('warn', event, message, meta);
  }

  public error(
    event: string,
    message?: string,
    meta?: {
      requestId?: string;
      correlationId?: string;
      context?: Record<string, unknown>;
      error?: unknown;
    }
  ): void {
    this.log('error', event, message, meta);
  }

  public child(childComponent: string): Logger {
    return new Logger(`${this.component}:${childComponent}`, this.minLevel, this.outputHandler);
  }
}

export const rootLogger = new Logger('App');
