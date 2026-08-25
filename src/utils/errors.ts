/**
 * Autonomous Telegram Channel Manager - Error Handling Utilities
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.context = context;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 500, 'CONFIGURATION_ERROR', true, context);
  }
}

export class TelegramApiError extends AppError {
  public readonly telegramErrorCode?: number;

  constructor(message: string, telegramErrorCode?: number, context?: Record<string, unknown>) {
    super(message, 502, 'TELEGRAM_API_ERROR', true, context);
    this.telegramErrorCode = telegramErrorCode;
  }
}

export class GeminiApiError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 502, 'GEMINI_API_ERROR', true, context);
  }
}

export class WebhookValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 401, 'WEBHOOK_VALIDATION_ERROR', true, context);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access', context?: Record<string, unknown>) {
    super(message, 401, 'UNAUTHORIZED', true, context);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', context?: Record<string, unknown>) {
    super(message, 404, 'NOT_FOUND', true, context);
  }
}

/**
 * Format error for public/client JSON responses.
 * Guarantees that stack traces, secrets, and internal paths are never returned.
 */
export function formatSafeErrorResponse(error: unknown, environment = 'production'): {
  error: {
    message: string;
    code: string;
    statusCode: number;
  };
} {
  if (error instanceof AppError) {
    return {
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      },
    };
  }

  const defaultMessage =
    environment === 'development' || environment === 'test'
      ? (error instanceof Error ? error.message : 'An unexpected error occurred')
      : 'An unexpected internal error occurred';

  return {
    error: {
      message: defaultMessage,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    },
  };
}
