import createLogger from './logger.js';

const log = createLogger('errors');

export interface ApiError {
  error: string;
  code?: string;
  status: number;
  timestamp: string;
  path?: string;
  requestId?: string;
}

// Sensitive keywords to redact from error messages
const SENSITIVE_KEYWORDS = [
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'auth',
  'credential',
  'key',
  'bearer',
  'jwt',
];

/**
 * Sanitize error message to prevent information leakage
 */
export function sanitizeErrorMessage(message: string, isDevelopment = false): string {
  if (isDevelopment) {
    return message; // Return full details in development
  }

  // Remove sensitive information
  let sanitized = message;
  for (const keyword of SENSITIVE_KEYWORDS) {
    const regex = new RegExp(`${keyword}[^\\s:]*`, 'gi');
    sanitized = sanitized.replace(regex, `[${keyword.toUpperCase()}_REDACTED]`);
  }

  // Remove file paths
  sanitized = sanitized.replace(/\/[a-zA-Z0-9_\-.\/]+\.(ts|js|json)/g, '[PATH_REDACTED]');

  // Remove IP addresses and URLs with auth
  sanitized = sanitized.replace(/https?:\/\/[^@]+@/g, 'https://[CREDS_REDACTED]@');

  return sanitized;
}

/**
 * Create API error response
 */
export function createErrorResponse(
  error: Error | string,
  statusCode: number = 500,
  options: {
    code?: string;
    isDevelopment?: boolean;
    path?: string;
    requestId?: string;
  } = {}
): ApiError {
  const isDevelopment = options.isDevelopment || process.env.NODE_ENV === 'development';
  const message = typeof error === 'string' ? error : error.message;
  const sanitized = sanitizeErrorMessage(message, isDevelopment);

  return {
    error: sanitized,
    code: options.code || 'INTERNAL_ERROR',
    status: statusCode,
    timestamp: new Date().toISOString(),
    path: options.path,
    requestId: options.requestId,
  };
}

/**
 * Handle and log errors
 */
export function handleError(
  error: Error | string,
  context: string,
  options: {
    statusCode?: number;
    isDevelopment?: boolean;
    throwable?: boolean;
  } = {}
): ApiError {
  const isDevelopment = options.isDevelopment || process.env.NODE_ENV === 'development';
  const statusCode = options.statusCode || 500;
  const message = typeof error === 'string' ? error : error.message;

  // Log full error internally
  if (typeof error === 'string') {
    log.error(`[${context}] ${message}`);
  } else {
    log.error(`[${context}] ${message}`, error.stack);
  }

  const response = createErrorResponse(error, statusCode, {
    code: `${context.toUpperCase()}_ERROR`,
    isDevelopment,
  });

  if (options.throwable) {
    const err = new Error(JSON.stringify(response));
    (err as any).status = statusCode;
    (err as any).apiError = response;
    throw err;
  }

  return response;
}

/**
 * Create validation error response
 */
export function createValidationError(
  fields: Record<string, string>,
  statusCode: number = 400
): ApiError {
  return {
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    status: statusCode,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Express error handler middleware
 */
export function errorHandlerMiddleware(
  err: any,
  req: any,
  res: any,
  next: any
) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  let statusCode = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Not found';
  }

  const response = createErrorResponse(message, statusCode, {
    isDevelopment,
    path: req.path,
    requestId: req.id,
  });

  // Log the full error
  if (statusCode >= 500) {
    log.error(`[${req.method} ${req.path}] ${message}`, isDevelopment ? err.stack : undefined);
  } else {
    log.warn(`[${req.method} ${req.path}] ${message}`);
  }

  if (!res.headersSent) {
    res.status(statusCode).json(response);
  }
}
