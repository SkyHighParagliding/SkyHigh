/**
 * Additional security and validation utilities
 */

import createLogger from './logger.js';

const log = createLogger('security');

/**
 * IP address validation and classification
 */
export function validateIPAddress(ip: string): {
  valid: boolean;
  isPrivate: boolean;
  error?: string;
} {
  // IPv4 validation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) {
    return { valid: false, isPrivate: false, error: 'Invalid IP format' };
  }

  const parts = ip.split('.');
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      return { valid: false, isPrivate: false, error: 'Invalid IP octet' };
    }
  }

  // Check if private IP
  const isPrivate =
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('192.168.') ||
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip.startsWith('169.254.'); // Link-local

  return { valid: true, isPrivate };
}

/**
 * File upload security validation
 */
export function validateFileUpload(
  filename: string,
  mimetype: string,
  size: number,
  options: {
    maxSize?: number;
    allowedMimes?: string[];
    allowedExtensions?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
  const allowedMimes = options.allowedMimes || ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExtensions = options.allowedExtensions || ['jpg', 'jpeg', 'png', 'webp'];

  // Check size
  if (size > maxSize) {
    return { valid: false, error: `File too large: ${size} > ${maxSize}` };
  }

  // Check MIME type
  if (!allowedMimes.includes(mimetype)) {
    return { valid: false, error: `MIME type not allowed: ${mimetype}` };
  }

  // Check extension
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext || !allowedExtensions.includes(ext)) {
    return { valid: false, error: `File extension not allowed: ${ext}` };
  }

  // Check for null bytes (injection attack)
  if (filename.includes('\0') || filename.includes('\x00')) {
    return { valid: false, error: 'Invalid filename: contains null bytes' };
  }

  // Check for path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, error: 'Invalid filename: path traversal detected' };
  }

  return { valid: true };
}

/**
 * Rate limiting check for login attempts
 */
export class LoginAttemptTracker {
  private attempts = new Map<string, Array<{ timestamp: number }>>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  recordAttempt(identifier: string): boolean {
    const now = Date.now();
    if (!this.attempts.has(identifier)) {
      this.attempts.set(identifier, []);
    }

    const userAttempts = this.attempts.get(identifier)!;

    // Remove old attempts outside the window
    const validAttempts = userAttempts.filter(a => now - a.timestamp < this.windowMs);

    if (validAttempts.length >= this.maxAttempts) {
      log.warn(`Too many login attempts for ${identifier}`);
      return false; // Blocked
    }

    validAttempts.push({ timestamp: now });
    this.attempts.set(identifier, validAttempts);
    return true; // Allowed
  }

  isBlocked(identifier: string): boolean {
    const attempts = this.attempts.get(identifier);
    if (!attempts) return false;

    const now = Date.now();
    const validAttempts = attempts.filter(a => now - a.timestamp < this.windowMs);
    return validAttempts.length >= this.maxAttempts;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

/**
 * Content Security Policy (CSP) header builder
 */
export function buildCSPHeader(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // In production, remove 'unsafe-inline'
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * Security headers middleware data
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

/**
 * Prevent clickjacking attacks
 */
export function isValidReferer(referer: string | undefined, allowedOrigins: string[]): boolean {
  if (!referer) {
    return true; // No referer is OK (privacy mode browsers)
  }

  try {
    const url = new URL(referer);
    return allowedOrigins.some(origin => url.origin === origin);
  } catch {
    return false; // Invalid URL
  }
}

/**
 * XSS prevention: escape HTML
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Sanitize user input to prevent script injection
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Validate and normalize URLs
 */
export function validateUserURL(urlString: string): {
  valid: boolean;
  url?: URL;
  error?: string;
} {
  try {
    const url = new URL(urlString);

    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Only HTTP/HTTPS URLs allowed' };
    }

    // Prevent localhost/internal access
    const hostname = url.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      return { valid: false, error: 'Localhost URLs not allowed' };
    }

    // Prevent private IP ranges
    if (hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')) {
      return { valid: false, error: 'Private IP ranges not allowed' };
    }

    return { valid: true, url };
  } catch (e: any) {
    return { valid: false, error: `Invalid URL: ${e.message}` };
  }
}

/**
 * Token expiration validation
 */
export function isTokenExpired(expiresAt: Date | string): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return new Date() > expiry;
}

/**
 * Timing-safe string comparison (prevent timing attacks)
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
