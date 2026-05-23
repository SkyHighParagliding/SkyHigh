# Workstream Template: Copy This Structure

**Summary**: Every workstream document follows this template. Use this as your guide when reading workstream pages.

---

## [Workstream Title]

**Summary**: One sentence describing what this workstream delivers.

**Workstream Code**: A1, A2, B1, C2, etc. (from dependency graph)

**Assigned to**: [Agent Name]

**Tier**: 1, 2, 3, or 4 (from parallelization schedule)

**Estimated LOE**: X days (from workstream table)

---

## Dependencies

**Hard Requirements** (must complete before starting):
- Foundation (always)
- [Workstream X] (if applicable)

**Soft Dependencies** (optional, integration is better if complete):
- [Workstream Y] (if applicable)

**Blockers Found**: (document if Foundation is missing something)

---

## What You're Building

### User Stories
- "As a [user], I can [action] so that [value]"
- "As a [user], I can [action] so that [value]"

### Features
1. Feature 1 (description)
2. Feature 2 (description)
3. Feature 3 (description)

### Out of Scope
- Feature X (intentionally not included)
- Feature Y (defer to Phase 2)

---

## Success Criteria

The workstream is **done** when:
- [ ] `npm run dev` loads without errors
- [ ] Database migrations applied (check `schema_migrations`)
- [ ] All [X] API routes respond with correct structure
- [ ] All [Y] React components render without errors
- [ ] All tests pass: `npm test -- [workstream]`
- [ ] No TypeScript errors in workstream code
- [ ] Integration contracts satisfied (see below)
- [ ] Seed data loads (if applicable): `npm run seed`
- [ ] Environment variables documented
- [ ] README updated with workstream-specific setup
- [ ] Handoff checklist complete (see end of document)

---

## Database Changes

### New Tables (if any)

Table name: `[table_name]`
```
id (PK INTEGER)
field1 (TEXT)
field2 (INTEGER)
createdAt (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
...
```

### Migrations

Create migration file: `server/pg_migrations/NNN_[workstream_name].sql`

Migration SQL (specific statements):
```sql
CREATE TABLE flights (
  id SERIAL PRIMARY KEY,
  pilotId INTEGER NOT NULL REFERENCES pilot_accounts(id),
  siteId INTEGER NOT NULL REFERENCES sites(id),
  status TEXT DEFAULT 'active',
  startedAt TIMESTAMP DEFAULT NOW(),
  endedAt TIMESTAMP,
  maxAltitude REAL,
  maxSpeed REAL,
  totalDistance REAL
);

CREATE INDEX idx_flights_pilotId ON flights(pilotId);
CREATE INDEX idx_flights_siteId ON flights(siteId);
```

---

## API Routes

### Route 1: GET /api/[resource]

**Purpose**: Retrieve list of [resource]

**Authentication**: [Public | Admin | Pilot]

**Request**:
```
GET /api/flights?siteId=123&status=active
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": 1,
      "pilotId": 5,
      "siteId": 123,
      "status": "active",
      "startedAt": "2026-04-23T10:00:00Z",
      "maxAltitude": 1500
    }
  ]
}
```

**Error Response** (500):
```json
{
  "statusCode": 500,
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

### Route 2: POST /api/[resource]

**Purpose**: Create a new [resource]

**Authentication**: [Admin | Pilot]

**Request**:
```
POST /api/flights
Content-Type: application/json
Authorization: Bearer [pilot_token]

{
  "siteId": 123,
  "startedAt": "2026-04-23T10:00:00Z"
}
```

**Validation**:
- siteId: required, must exist in sites table
- startedAt: required, ISO 8601 timestamp

**Response** (201):
```json
{
  "statusCode": 201,
  "data": {
    "id": 42,
    "pilotId": 5,
    "siteId": 123,
    "status": "active",
    "startedAt": "2026-04-23T10:00:00Z"
  }
}
```

### Route 3: PUT /api/[resource]/:id

**Purpose**: Update an existing [resource]

**Authentication**: [Admin | Pilot (own records only)]

**Request**:
```
PUT /api/flights/42
Authorization: Bearer [pilot_token]

{
  "status": "landed",
  "endedAt": "2026-04-23T14:30:00Z",
  "maxAltitude": 2200
}
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": { ... updated flight object ... }
}
```

### Route 4: DELETE /api/[resource]/:id

**Purpose**: Delete a [resource]

**Authentication**: [Admin only | Pilot (own records only)]

**Request**:
```
DELETE /api/flights/42
Authorization: Bearer [admin_token]
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": { "id": 42, "deleted": true }
}
```

---

## React Components & Hooks

### Hook 1: useFlightTracking()

**Purpose**: Track pilot's live GPS position

**Returns**:
```typescript
{
  isTracking: boolean;
  currentLocation: { lat: number; lon: number; altitude: number; speed: number };
  stats: { duration: string; distance: number; maxAltitude: number };
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  error: Error | null;
}
```

**Usage**:
```typescript
const { isTracking, currentLocation, startTracking } = useFlightTracking();

return (
  <div>
    <p>Altitude: {currentLocation?.altitude}m</p>
    <button onClick={startTracking} disabled={isTracking}>
      {isTracking ? 'Recording...' : 'Start Flight'}
    </button>
  </div>
);
```

### Component 1: CheckinWizard

**Purpose**: 3-step pilot check-in flow

**Props**:
```typescript
{
  siteId: number;
  onComplete: (checkinData: { siteId: number; gear: string; acknowledged: boolean }) => void;
  onCancel: () => void;
}
```

**Behavior**:
- Step 1: Select site from dropdown (show current conditions)
- Step 2: Display site hazards, require checkbox to acknowledge
- Step 3: Select gear type, confirm flight intention

**Usage**:
```typescript
<CheckinWizard
  siteId={123}
  onComplete={handleCheckinComplete}
  onCancel={() => navigate('/')}
/>
```

---

## Integration Contracts (Critical)

**Other workstreams depend on these**:

### Tables Produced
- `flights` — All fields specified above
- `breadcrumbs` — GPS points for each flight

### Routes Provided
- `GET /api/flights` — Public list (no auth required)
- `POST /api/flights` — Start tracking (requires pilot auth)
- `PUT /api/flights/:id` — Update flight (requires pilot auth, owns flight)

### Hooks Provided
- `useFlightTracking()` — live tracking state
- `useFlightHistory()` — past flights list

### Data Format Guarantees
- All timestamps in ISO 8601 (UTC)
- All altitudes in meters (AMSL)
- All speeds in m/s
- All distances in kilometers

### Database Constraints
- Flights must have valid pilotId, siteId
- Breadcrumbs must have valid flightId
- All timestamps immutable after creation

---

## Testing

### Unit Tests (server/tests/flights.test.ts)

```typescript
describe('Flight Routes', () => {
  test('GET /api/flights returns all flights', async () => {
    const res = await fetch('http://localhost:3001/api/flights');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('POST /api/flights creates flight with pilot auth', async () => {
    const res = await fetch('http://localhost:3001/api/flights', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${pilotToken}` },
      body: JSON.stringify({ siteId: 123 })
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
  });

  test('POST /api/flights fails without auth', async () => {
    const res = await fetch('http://localhost:3001/api/flights', {
      method: 'POST',
      body: JSON.stringify({ siteId: 123 })
    });
    expect(res.status).toBe(401);
  });
});
```

### Component Tests (src/tests/CheckinWizard.test.tsx)

```typescript
describe('CheckinWizard', () => {
  test('renders 3-step flow', () => {
    render(<CheckinWizard siteId={123} onComplete={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/select.*site/i)).toBeInTheDocument();
  });

  test('calls onComplete when all steps finished', async () => {
    const onComplete = vi.fn();
    render(<CheckinWizard siteId={123} onComplete={onComplete} onCancel={vi.fn()} />);
    
    // Step 1: site already selected via prop
    await userEvent.click(screen.getByText(/next/i));
    
    // Step 2: acknowledge hazards
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByText(/next/i));
    
    // Step 3: select gear and submit
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Paraglider');
    await userEvent.click(screen.getByText(/confirm/i));
    
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 123, gear: 'Paraglider' })
    );
  });
});
```

### Manual Testing Checklist

- [ ] `npm run dev` starts without errors
- [ ] Open browser to `http://localhost:5000`
- [ ] Can trigger [Feature 1] and verify result
- [ ] Can trigger [Feature 2] and verify result
- [ ] Check browser console for errors
- [ ] Open DevTools, check Network tab for failed requests
- [ ] Test on mobile (responsive)
- [ ] Test with slow network (throttle in DevTools)

---

## Known Gotchas

- [Issue 1]: [Explanation and workaround]
- [Issue 2]: [Explanation and workaround]

---

## File Checklist

Deliverables (must create these):

Server:
- [ ] `server/migrations/NNN_[workstream].sql` — database changes
- [ ] `server/routes/[resource].ts` — API routes
- [ ] `server/utils/[utility].ts` — shared server logic (if needed)

Frontend:
- [ ] `src/pages/[Page].tsx` — public page (if needed)
- [ ] `src/pages/admin/[AdminPage].tsx` — admin page (if needed)
- [ ] `src/components/[Component].tsx` — components (if needed)
- [ ] `src/hooks/use[Hook].ts` — React Query hooks

Tests:
- [ ] `src/tests/[module].test.ts` — unit + integration tests

Docs:
- [ ] Workstream README (setup instructions)
- [ ] Inline code comments (for complex logic only)

---

## Environment Variables

Add to `.env.local` (if needed):
```
[WORKSTREAM_SPECIFIC_KEY]=value
```

Document why each is needed.

---

## Verification Checklist (Before Handoff)

**Agent: Complete ALL of these before marking workstream done**

- [ ] All files created (see File Checklist)
- [ ] Database migrations applied successfully
  ```bash
  npm run seed  # Confirms DB is initialized
  ```
- [ ] All API routes tested locally
  ```bash
  curl http://localhost:3001/api/[resource]
  ```
- [ ] All tests passing
  ```bash
  npm test -- [workstream]
  ```
- [ ] No TypeScript errors
  ```bash
  npm run type-check  # (if this script exists)
  ```
- [ ] No console errors in browser
- [ ] All routes match contract specification (exact method, path, request/response)
- [ ] All components render (check in browser)
- [ ] Seed data loads without errors
- [ ] Environment variables documented
- [ ] Integration tests pass (if other workstreams available)
- [ ] README updated
- [ ] No hardcoded values (everything from settings or env)
- [ ] Handoff document created (see below)

---

## Handoff Document

When marking complete, provide:

**Summary**: Brief recap of what was built

**Key Files**:
- API routes in: `server/routes/[resource].ts`
- Components in: `src/components/[component]/`
- Hooks in: `src/hooks/use[Hook].ts`

**Integration Points**:
- These routes are now available for other workstreams: [list]
- These tables are populated: [list]
- These hooks can be used: [list]

**Test Results**:
```
PASS src/tests/[module].test.ts (X tests)
...
Test Suites: X passed, X total
Tests: X passed, X total
```

**Known Issues** (if any):
- [Issue]: [status] (e.g., "deferred to Phase 2", "workaround documented")

**Database State**:
- Migrations applied: [list migration numbers]
- Seed data loaded: [what was loaded]

**Next Steps for Dependent Workstreams**:
- Can now call routes: [list]
- Can now use hooks: [list]
- Can now query tables: [list]

---

## Related Pages

- [[skyhigh-foundation]] — Read this first
- [[skyhigh-parallel-workstreams]] — Dependency graph, parallelization strategy
- [[skyhigh-workstream-A1-auth]] — Example: Authentication workstream
