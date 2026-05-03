# Timeout Configuration Guide

This guide explains how to configure various timeouts in the SkyHigh application for different deployment scenarios.

## Overview

Timeouts are critical for preventing resource exhaustion and improving user experience. The application implements timeouts at multiple levels:

1. **HTTP Request Timeouts** - Overall request completion time
2. **Database Query Timeouts** - Maximum query execution time
3. **External API Timeouts** - Third-party service calls
4. **Session Timeouts** - User session expiration
5. **Cache Timeouts** - Cached data TTL

## Configuration via Constants

All timeout values are defined in `server/utils/constants.ts`:

```typescript
export const API_CONFIG = {
  DEFAULT_TIMEOUT_MS: 10000,              // 10 seconds
  FETCH_TIMEOUT_MS: 8000,                 // 8 seconds
  MAX_RETRIES: 3,
  INITIAL_BACKOFF_MS: 1000,               // 1 second
};

export const CACHE_CONFIG = {
  PUBLIC_SITES_TTL_MS: 30000,             // 30 seconds
  WEATHER_GRID_CACHE_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
  EXTENDED_FORECAST_TTL_MS: 3600000,      // 1 hour
  EMERGENCY_HOSPITALS_CACHE_TTL_MS: 7 * 24 * 3600 * 1000, // 7 days
};

export const CSRF_CONFIG = {
  EXPIRY_TIME_MS: 24 * 60 * 60 * 1000,   // 24 hours
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,   // 1 hour
};

export const DB_POOL_CONFIG = {
  DEFAULT_CONNECTION_TIMEOUT_MS: 10000,  // 10 seconds
  DEFAULT_STATEMENT_TIMEOUT_MS: 30000,   // 30 seconds
};
```

## Environment Variables

Override default timeouts using environment variables:

```bash
# Database timeouts (in milliseconds)
DB_CONNECTION_TIMEOUT_MS=10000  # Max time to acquire a connection
DB_STATEMENT_TIMEOUT=30000      # Max query execution time

# API timeouts (configure in constants.ts)
# DEFAULT_TIMEOUT_MS=10000
# FETCH_TIMEOUT_MS=8000

# Cache TTL (configure in constants.ts)
# Modify constants.ts for cache durations
```

## Timeout Scenarios

### 1. Public Sites List (Quick Response)
- **HTTP Timeout**: 3 seconds
- **Cache TTL**: 30 seconds
- **Rationale**: Public list is frequently accessed; aggressive caching reduces DB load

```typescript
// server/routes/sites/crud.ts
const { limit, offset } = getPaginationParams(req.query);
// Returns cached data if available (< 30s old)
```

### 2. Weather Data Fetch (External API)
- **Fetch Timeout**: 8 seconds
- **Retry Attempts**: 3
- **Backoff**: Exponential (1s, 2s, 4s)
- **Cache TTL**: 30 minutes
- **Rationale**: Weather APIs are slower; retries handle transient failures

```typescript
// server/weather.ts
const response = await fetchWithRetry(url, options, 3, 1000);
// With exponential backoff: 1s, 2s, 4s between attempts
```

### 3. Database Queries (Normal Operations)
- **Query Timeout**: 30 seconds
- **Connection Timeout**: 10 seconds
- **Pool Max**: 20 connections
- **Rationale**: Most queries complete in < 1 second; 30s handles heavy reports

```typescript
// server/pgDb.ts
statement_timeout: '30s'
connectionTimeoutMillis: 10000
max: 20
```

### 4. Long-Running Reports (Large Results)
- **HTTP Timeout**: 60 seconds
- **Query Timeout**: 60 seconds
- **Pagination Required**: Yes (LIMIT 1000)
- **Rationale**: Reports may return 10k+ rows; pagination prevents memory issues

```typescript
// Implement pagination for large result sets
const { limit, offset } = getPaginationParams(req.query);
const results = await db.prepare(
  `SELECT * FROM large_table LIMIT ? OFFSET ?`
).all(limit, offset);
```

### 5. User Sessions
- **Session TTL**: 24 hours
- **Cleanup Interval**: 1 hour
- **Idle Timeout**: Not enforced (will use 24h TTL)
- **Rationale**: Balance between security and user experience

```typescript
// server/utils/sessionTokens.ts
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
```

### 6. CSRF Token Expiry
- **Token Lifetime**: 24 hours
- **Cleanup**: Hourly
- **Rationale**: CSRF tokens are per-user; 24h matches session TTL

```typescript
// server/utils/csrf.ts
export const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
```

## Development vs. Production

### Development Settings
```bash
# Longer timeouts for debugging
DB_STATEMENT_TIMEOUT=120000     # 2 minutes
DB_CONNECTION_TIMEOUT_MS=30000  # 30 seconds

# Disable caching for testing
CACHE_TTL_MS=1000              # 1 second
```

### Production Settings
```bash
# Aggressive timeouts to prevent resource exhaustion
DB_STATEMENT_TIMEOUT=30000      # 30 seconds
DB_CONNECTION_TIMEOUT_MS=10000  # 10 seconds

# Longer cache TTL to reduce load
CACHE_TTL_MS=300000            # 5 minutes
```

## Monitoring Timeouts

Check application logs for timeout errors:

```bash
# View timeout events
grep -E "timeout|TIMEOUT" application.log

# Monitor slow queries
grep "duration > 10000" database.log
```

Health check endpoint shows current timeouts:

```bash
curl http://localhost:3000/health
```

Response includes database latency and memory usage.

## Best Practices

1. **Use Pagination**: Always paginate large result sets
   ```typescript
   const { limit, offset } = getPaginationParams(req.query);
   ```

2. **Implement Retries**: External APIs may be temporarily slow
   ```typescript
   const data = await fetchWithRetry(url, options, 3, 1000);
   ```

3. **Cache Aggressively**: Reduce database load
   ```typescript
   if (isCacheValid()) {
     return res.json(getPublicSitesCache().data);
   }
   ```

4. **Monitor Latency**: Track response times
   ```typescript
   const start = Date.now();
   const result = await db.prepare(query).all();
   const latency = Date.now() - start;
   if (latency > 100) {
     log.warn(`Slow query: ${latency}ms`);
   }
   ```

5. **Set Appropriate Limits**: Match business requirements
   - Public endpoints: 3-5 second timeout
   - Authenticated endpoints: 10-30 seconds
   - Reports/Heavy operations: 60+ seconds

## Troubleshooting

### "Query execution timeout"
- Increase `DB_STATEMENT_TIMEOUT`
- Add database indexes for slow queries
- Implement pagination to reduce result set size

### "Connection pool exhausted"
- Increase `DB_POOL_MAX`
- Decrease `DB_IDLE_TIMEOUT_MS` to close idle connections faster
- Check for connection leaks (unclosed transactions)

### "Request timeout (HTTP 504)"
- Increase `DEFAULT_TIMEOUT_MS`
- Paginate large result sets
- Use database indexes for faster queries
- Add caching with appropriate TTL

### High memory usage
- Implement/improve pagination
- Reduce cache TTL
- Check for memory leaks in long-running processes

## Migration and Rollback

Use the migration system to track timeout configuration changes:

```bash
# Apply pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# See migration status
npm run migrate:status
```

## Summary Table

| Component | Development | Production | Notes |
|-----------|------------|-----------|-------|
| HTTP Timeout | 30s | 10-60s | Depends on endpoint |
| Query Timeout | 120s | 30s | Slow queries in dev |
| Connection Timeout | 30s | 10s | Network latency varies |
| Session TTL | 24h | 24h | Balance security/UX |
| Cache TTL | 1s | 5-60m | Dev needs fresh data |
| Pool Size | 10 | 20-50 | CPU cores determine max |
