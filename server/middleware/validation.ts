import { Request, Response, NextFunction } from 'express';
import createLogger from '../utils/logger.js';

const log = createLogger('validation');

// Validation rules for common fields
const validationRules: Record<string, (value: any) => boolean> = {
  email: (val) => typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  url: (val) => {
    if (typeof val !== 'string') return false;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  phoneNumber: (val) => typeof val === 'string' && /^(\+61|0)[2-9]\d{8}$/.test(val.replace(/\s|-/g, '')),
  alphanumeric: (val) => typeof val === 'string' && /^[a-zA-Z0-9_-]*$/.test(val),
  noHtml: (val) => typeof val === 'string' && !/<[^>]*>/g.test(val),
  nonNegativeNumber: (val) => typeof val === 'number' && val >= 0,
  positiveNumber: (val) => typeof val === 'number' && val > 0,
};

export function validateEmail(email: string): boolean {
  return validationRules.email(email);
}

export function validateUrl(url: string): boolean {
  return validationRules.url(url);
}

export function validatePhoneNumber(phone: string): boolean {
  return validationRules.phoneNumber(phone);
}

export function sanitizeString(str: string | undefined): string {
  if (!str) return '';
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim()
    .substring(0, 1000); // Cap at 1000 chars
}

export function validateInput(data: Record<string, any>, schema: Record<string, string[]>): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    for (const rule of rules) {
      if (rule === 'required' && !value) {
        errors[field] = `${field} is required`;
        break;
      }

      const validator = validationRules[rule];
      if (validator && value !== undefined && value !== null && !validator(value)) {
        errors[field] = `${field} failed validation: ${rule}`;
        break;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
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

export default {
  validateEmail,
  validateUrl,
  validatePhoneNumber,
  sanitizeString,
  validateInput,
  validationMiddleware,
};
