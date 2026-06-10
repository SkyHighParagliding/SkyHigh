import { Request, Response, NextFunction } from 'express';
import createLogger from '../utils/logger.js';

const log = createLogger('validation');

function sanitizeString(str: string | undefined): string {
  if (!str) return '';
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim()
    .substring(0, 1000); // Cap at 1000 chars
}

// Middleware to validate and sanitize common fields
export function validationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Store original body
  const originalBody = req.body;
  const sanitized: Record<string, any> = {};

  // Sanitize common string fields
  const stringFields = ['name', 'title', 'description', 'surname', 'organisation', 'position', 'notes'];
  for (const field of stringFields) {
    if (field in originalBody && typeof originalBody[field] === 'string') {
      sanitized[field] = sanitizeString(originalBody[field]);
    }
  }

  // Preserve other fields as-is (they'll be validated per-endpoint)
  for (const [key, value] of Object.entries(originalBody)) {
    if (!(key in sanitized)) {
      sanitized[key] = value;
    }
  }

  req.body = sanitized;
  next();
}
