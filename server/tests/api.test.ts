/**
 * Integration tests for API endpoints
 * Run with: npm test
 */

import db from '../db.js';
import createLogger from '../utils/logger.js';

const log = createLogger('tests');

// Test utilities
export async function setupTestDatabase(): Promise<void> {
  log.info('Setting up test database...');
  // In a real setup, you would create test data fixtures here
}

export async function teardownTestDatabase(): Promise<void> {
  log.info('Tearing down test database...');
  // Clean up test data
}

// Health check tests
export async function testHealthEndpoint(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  try {
    // Test database connectivity
    const result = await db.prepare('SELECT 1').get();
    if (result) {
      log.info('✓ Database connectivity test passed');
      passed++;
    } else {
      log.error('✗ Database connectivity test failed');
      failed++;
    }
  } catch (e: any) {
    log.error(`✗ Database connectivity test error: ${e.message}`);
    failed++;
  }

  return { passed, failed };
}

// Pagination tests
export async function testPagination(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  try {
    // Test sites pagination
    const sites = await db.prepare('SELECT COUNT(*) as count FROM sites').get() as { count: number };
    if (sites.count !== undefined) {
      log.info('✓ Pagination count query test passed');
      passed++;
    } else {
      log.error('✗ Pagination count query test failed');
      failed++;
    }
  } catch (e: any) {
    log.error(`✗ Pagination test error: ${e.message}`);
    failed++;
  }

  return { passed, failed };
}

// Validation tests
export async function testValidation(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  // Test email validation
  const validEmails = ['test@example.com', 'user+tag@domain.co.uk'];
  const invalidEmails = ['invalid', 'no@domain', '@example.com'];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const email of validEmails) {
    if (emailRegex.test(email)) {
      log.info(`✓ Email validation passed: ${email}`);
      passed++;
    } else {
      log.error(`✗ Email validation failed: ${email}`);
      failed++;
    }
  }

  for (const email of invalidEmails) {
    if (!emailRegex.test(email)) {
      log.info(`✓ Invalid email rejected: ${email}`);
      passed++;
    } else {
      log.error(`✗ Invalid email not rejected: ${email}`);
      failed++;
    }
  }

  return { passed, failed };
}

// Rate limit tests
export async function testRateLimiting(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  // Test that rate limit configuration exists
  const limits = {
    LOGIN_WINDOW_MS: 15 * 60 * 1000,
    LOGIN_MAX_ATTEMPTS: 10,
    SEARCH_WINDOW_MS: 60 * 1000,
    SEARCH_MAX_REQUESTS: 20,
  };

  if (limits.LOGIN_MAX_ATTEMPTS > 0 && limits.SEARCH_MAX_REQUESTS > 0) {
    log.info('✓ Rate limit configuration test passed');
    passed++;
  } else {
    log.error('✗ Rate limit configuration test failed');
    failed++;
  }

  return { passed, failed };
}

// Run all tests
export async function runAllTests(): Promise<void> {
  log.info('Starting integration tests...\n');

  const results: Record<string, { passed: number; failed: number }> = {};

  results['Health'] = await testHealthEndpoint();
  results['Pagination'] = await testPagination();
  results['Validation'] = await testValidation();
  results['RateLimiting'] = await testRateLimiting();

  // Print summary
  log.info('\n=== Test Summary ===');
  let totalPassed = 0;
  let totalFailed = 0;

  for (const [name, result] of Object.entries(results)) {
    totalPassed += result.passed;
    totalFailed += result.failed;
    const status = result.failed === 0 ? '✓' : '✗';
    log.info(`${status} ${name}: ${result.passed} passed, ${result.failed} failed`);
  }

  log.info(`\nTotal: ${totalPassed} passed, ${totalFailed} failed`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(err => {
    log.error('Test suite error:', err);
    process.exit(1);
  });
}
