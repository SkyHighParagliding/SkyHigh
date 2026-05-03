# SkyHigh API Documentation

## Overview

The SkyHigh API provides endpoints for managing paragliding sites, weather data, user authentication, and club information.

## Authentication

Most endpoints require authentication. Include your session token in the request:

```bash
# Example authenticated request
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.example.com/api/sites
```

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Login**: 10 attempts per 15 minutes
- **Search**: 20 requests per minute
- **State-changing operations**: 100 requests per hour per user
- **Submissions**: 20 per hour per user

Rate limit headers are included in responses:
- `RateLimit-Limit`: Total requests allowed
- `RateLimit-Remaining`: Requests remaining
- `RateLimit-Reset`: Unix timestamp when limit resets

## Common Response Format

### Success (2xx)

```json
{
  "data": {...},
  "total": 100,
  "limit": 50,
  "offset": 0,
  "hasMore": true
}
```

### Error (4xx, 5xx)

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "status": 400,
  "timestamp": "2026-05-03T10:30:00Z",
  "path": "/api/sites"
}
```

## Endpoints

### Sites

#### GET /api/sites
Retrieve a paginated list of all sites.

**Query Parameters:**
- `limit` (integer): Results per page (default: 50, max: 500)
- `offset` (integer): Number of results to skip (default: 0)
- `public` (boolean): Filter to public sites only

**Example:**
```bash
curl "https://api.example.com/api/sites?limit=25&offset=0"
```

#### GET /api/sites/:id
Retrieve a specific site by ID.

**Response:**
```json
{
  "id": "portsea",
  "name": "Portsea",
  "type": "Coastal",
  "status": "open",
  "pgRating": "PG3",
  "windDir": "SE",
  "windSpeed": "8-16kts",
  "lat": -38.3506,
  "lon": 144.7639,
  "hazards": [...],
  "rules": [...]
}
```

#### POST /api/sites
Create a new site (requires authentication).

**Request Body:**
```json
{
  "id": "newsite",
  "name": "New Site",
  "type": "Inland",
  "pgRating": "PG2",
  "windDir": "N",
  "windSpeed": "10-15kts",
  "lat": -37.5,
  "lon": 145.0,
  "description": "...",
  "hazards": [],
  "rules": []
}
```

#### PUT /api/sites/:id
Update an existing site (requires authentication).

#### DELETE /api/sites/:id
Delete a site (requires authentication).

### Contacts

#### GET /api/contacts
Retrieve a paginated list of all contacts (requires authentication).

**Query Parameters:**
- `limit` (integer): Results per page (default: 50, max: 500)
- `offset` (integer): Number of results to skip

#### GET /api/contacts/search
Search contacts by name or organization (requires authentication).

**Query Parameters:**
- `q` (string): Search query
- `limit` (integer): Results per page
- `offset` (integer): Offset for pagination

**Example:**
```bash
curl "https://api.example.com/api/contacts/search?q=john&limit=10"
```

### Weather

#### GET /api/weather/stations/nearby
Find nearby weather stations.

**Query Parameters:**
- `lat` (number): Latitude (required)
- `lon` (number): Longitude (required)
- `radius` (number): Search radius in km (default: 20)

#### GET /api/weather/:siteId/current
Get current weather observations for a site.

#### GET /api/weather/:siteId/forecast
Get weather forecast for a site.

### News

#### GET /api/news
Retrieve a paginated list of news items.

**Query Parameters:**
- `limit` (integer): Results per page (default: 50)
- `offset` (integer): Offset for pagination

#### GET /api/news/:id
Retrieve a specific news item.

#### POST /api/news
Create a news item (requires authentication).

**Request Body:**
```json
{
  "id": "news-123",
  "title": "News Title",
  "content": "News content...",
  "date": "2026-05-03",
  "author": "John Doe"
}
```

### Health Check

#### GET /health
Check the health status of the API.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-05-03T10:30:00Z",
  "uptime": 3600000,
  "environment": "production",
  "database": {
    "connected": true,
    "latency": 2
  },
  "fileSystem": {
    "distAvailable": true,
    "indexAvailable": true
  },
  "memory": {
    "heapUsed": 128,
    "heapTotal": 256,
    "percentage": 50
  },
  "checks": [...]
}
```

Possible status values:
- `healthy`: All systems operational
- `degraded`: Some systems showing issues
- `unhealthy`: Critical systems down

## Error Codes

- `VALIDATION_ERROR`: Request validation failed
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Permission denied
- `NOT_FOUND`: Resource not found
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error

## CSRF Protection

For state-changing requests (POST, PUT, DELETE, PATCH), include a CSRF token:

```bash
# 1. Get CSRF token
CSRF_TOKEN=$(curl -X GET https://api.example.com/api/csrf-token)

# 2. Use token in POST request
curl -X POST \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example"}' \
  https://api.example.com/api/sites
```

## Examples

### List all sites with pagination

```bash
curl "https://api.example.com/api/sites?limit=50&offset=0"
```

### Search for contacts

```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.example.com/api/contacts/search?q=john&limit=10"
```

### Create a new news item

```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "X-CSRF-Token: TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "news-123",
    "title": "Club Meeting",
    "content": "Annual meeting is scheduled...",
    "date": "2026-05-10",
    "author": "Admin"
  }' \
  https://api.example.com/api/news
```

## Versioning

The API uses semantic versioning. Current version is reflected in response headers:

- `API-Version`: Current API version

Breaking changes will increment the major version. Non-breaking additions use minor versions.

## Support

For API support, contact the development team or file an issue in the project repository.
