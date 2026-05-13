# Workstream A1: Authentication & User Management

**Summary**: Implement complete authentication system for both admin and pilot accounts, including login/logout, password reset, sessions, contact directory, and role-based access control.

**Workstream Code**: A1

**Assigned to**: [TBD]

**Tier**: 1 (Independent)

**Estimated LOE**: 1 day

**Status**: ⏳ Pending

---

## Dependencies

**Hard Requirements** (must complete before starting):
- [[skyhigh-foundation]] — Read the complete architecture guide
- Foundation workstream complete (project setup, database, API patterns)

**Soft Dependencies** (optional, integration better if complete):
- None

**Blockers Found**: None

---

## What You're Building

### User Stories

- "As an admin, I can log in with email/password so that I can access the admin dashboard"
- "As an admin, I can log out so that my session ends securely"
- "As an admin, I can reset my password via email so that I can regain access if forgotten"
- "As a pilot, I can sign up with email/password so that I can track my flights"
- "As a pilot, I can log in and stay logged in for 30 days so that I don't need to re-authenticate frequently"
- "As the system, I can manage contacts with multiple roles (Committee, Safety Officer, Contractor, Parks Vic) so that admin can organize club stakeholders"

### Features

1. **Admin Authentication**
   - Email/password login with bcrypt hashing
   - Session tokens with 24-hour TTL
   - Password reset via email
   - Auto-migration of plain-text passwords to bcrypt on first login

2. **Pilot Authentication**
   - Public registration: email/password signup
   - Email/password login
   - Session tokens with 30-day TTL
   - Password reset

3. **Contact Directory**
   - Admin contacts (committee members, safety officers, contractors, Parks Vic liaison)
   - Role-based visibility flags
   - Position tracking (from TidyHQ if available, manual otherwise)
   - Phone/email obfuscation for safety officers (revealed on tap)

4. **Authorization & Access Control**
   - `requireAuth` middleware for admin routes
   - Separate token systems for admin vs pilot
   - Role flags controlling visibility in public pages

### Out of Scope

- OAuth / social login (deferred to Phase 2)
- Two-factor authentication (deferred to Phase 2)
- API key authentication (deferred to Phase 3)
- TidyHQ webhook sync (handled in workstream B3)

---

## Success Criteria

The workstream is **done** when:

- [ ] `npm run dev` loads without errors
- [ ] Database migrations applied (schema_migrations shows new entries)
- [ ] All 10 API routes respond with correct structure (see API Routes section)
- [ ] All 3 React components render without errors (LoginForm, SignupForm, ContactDirectory)
- [ ] All tests pass: `npm test -- a1-auth` (15+ tests)
- [ ] No TypeScript errors in workstream code
- [ ] Integration contracts satisfied (see Integration Contracts section)
- [ ] Seed contacts load: `npm run seed`
- [ ] README updated with auth-specific setup
- [ ] Default admin account auto-created on first run
- [ ] Handoff checklist complete (see end of document)

---

## Database Changes

### New Tables

**admin_users**
```sql
id SERIAL PRIMARY KEY
email TEXT UNIQUE NOT NULL
password TEXT NOT NULL  -- bcrypt hash
name TEXT NOT NULL
createdAt TIMESTAMP DEFAULT NOW()
```

**admin_sessions**
```sql
token TEXT PRIMARY KEY
userId INTEGER NOT NULL REFERENCES admin_users(id)
createdAt TIMESTAMP DEFAULT NOW()
expiresAt TIMESTAMP NOT NULL  -- 24h from now
```

**pilot_accounts**
```sql
id SERIAL PRIMARY KEY
email TEXT UNIQUE NOT NULL
password TEXT NOT NULL  -- bcrypt hash
name TEXT NOT NULL
phone TEXT
garminMapshare TEXT  -- satellite tracker ID
spotFeedId TEXT  -- satellite tracker ID
zoleoImei TEXT  -- satellite tracker ID
createdAt TIMESTAMP DEFAULT NOW()
```

**pilot_sessions**
```sql
token TEXT PRIMARY KEY
pilotId INTEGER NOT NULL REFERENCES pilot_accounts(id)
createdAt TIMESTAMP DEFAULT NOW()
expiresAt TIMESTAMP NOT NULL  -- 30d from now
```

**contacts**
```sql
id SERIAL PRIMARY KEY
name TEXT NOT NULL
surname TEXT
email TEXT UNIQUE
phone TEXT
notes TEXT
roles (stored as flags):
  - isAdmin BOOLEAN DEFAULT FALSE
  - isCommittee BOOLEAN DEFAULT FALSE
  - isSafetyCommittee BOOLEAN DEFAULT FALSE
  - isContractor BOOLEAN DEFAULT FALSE
  - isParksVic BOOLEAN DEFAULT FALSE
display flags:
  - displayCommittee BOOLEAN DEFAULT FALSE
  - displaySafety BOOLEAN DEFAULT FALSE
position TEXT  -- e.g., "President", "Treasurer" (from TidyHQ or manual)
createdAt TIMESTAMP DEFAULT NOW()
```

### Migrations

Create migration file: `server/pg_migrations/001_auth.sql`

```sql
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE admin_sessions (
  token TEXT PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES admin_users(id),
  createdAt TIMESTAMP DEFAULT NOW(),
  expiresAt TIMESTAMP NOT NULL
);

CREATE TABLE pilot_accounts (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  garminMapshare TEXT,
  spotFeedId TEXT,
  zoleoImei TEXT,
  createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE pilot_sessions (
  token TEXT PRIMARY KEY,
  pilotId INTEGER NOT NULL REFERENCES pilot_accounts(id),
  createdAt TIMESTAMP DEFAULT NOW(),
  expiresAt TIMESTAMP NOT NULL
);

CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  surname TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  notes TEXT,
  isAdmin BOOLEAN DEFAULT FALSE,
  isCommittee BOOLEAN DEFAULT FALSE,
  isSafetyCommittee BOOLEAN DEFAULT FALSE,
  isContractor BOOLEAN DEFAULT FALSE,
  isParksVic BOOLEAN DEFAULT FALSE,
  displayCommittee BOOLEAN DEFAULT FALSE,
  displaySafety BOOLEAN DEFAULT FALSE,
  position TEXT,
  createdAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_sessions_userId ON admin_sessions(userId);
CREATE INDEX idx_admin_sessions_expiresAt ON admin_sessions(expiresAt);
CREATE INDEX idx_pilot_sessions_pilotId ON pilot_sessions(pilotId);
CREATE INDEX idx_pilot_sessions_expiresAt ON pilot_sessions(expiresAt);
```

---

## API Routes

### Route 1: POST /api/auth/login (Admin)

**Purpose**: Authenticate admin user and return session token

**Authentication**: None (public)

**Rate Limiting**: 5 attempts per 15 minutes per IP

**Request**:
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@club.com",
  "password": "securepassword123"
}
```

**Validation**:
- email: required, must be valid email format
- password: required, min 8 characters

**Response** (200):
```json
{
  "statusCode": 200,
  "data": {
    "token": "abc123def456...",
    "user": {
      "id": 1,
      "email": "admin@club.com",
      "name": "John Doe"
    },
    "expiresAt": "2026-04-24T10:30:00Z"
  }
}
```

**Error Response** (401):
```json
{
  "statusCode": 401,
  "error": "Invalid email or password",
  "code": "AUTH_FAILED"
}
```

### Route 2: POST /api/pilot-auth/register (Pilot)

**Purpose**: Create new pilot account

**Authentication**: None (public)

**Rate Limiting**: 2 attempts per 15 minutes per IP (prevent account spam)

**Request**:
```
POST /api/pilot-auth/register
Content-Type: application/json

{
  "email": "pilot@example.com",
  "password": "securepassword123",
  "name": "Jane Pilot",
  "phone": "+61412345678"
}
```

**Validation**:
- email: required, unique
- password: required, min 8 characters
- name: required
- phone: optional

**Response** (201):
```json
{
  "statusCode": 201,
  "data": {
    "id": 5,
    "email": "pilot@example.com",
    "name": "Jane Pilot",
    "token": "xyz789abc..."
  }
}
```

### Route 3: POST /api/pilot-auth/login (Pilot)

**Purpose**: Authenticate pilot and return session token

**Authentication**: None (public)

**Rate Limiting**: 5 attempts per 15 minutes per IP

**Request**:
```
POST /api/pilot-auth/login
Content-Type: application/json

{
  "email": "pilot@example.com",
  "password": "securepassword123"
}
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": {
    "token": "xyz789abc...",
    "user": {
      "id": 5,
      "email": "pilot@example.com",
      "name": "Jane Pilot"
    },
    "expiresAt": "2026-05-23T10:30:00Z"
  }
}
```

### Route 4: POST /api/auth/logout (Both)

**Purpose**: Invalidate session token

**Authentication**: Bearer token (admin or pilot)

**Request**:
```
POST /api/auth/logout
Authorization: Bearer [token]
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": { "logged_out": true }
}
```

### Route 5: GET /api/auth/me (Both)

**Purpose**: Return current authenticated user

**Authentication**: Bearer token (admin or pilot)

**Request**:
```
GET /api/auth/me
Authorization: Bearer [admin_or_pilot_token]
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "type": "admin"
  }
}
```

### Route 6: POST /api/auth/request-password-reset

**Purpose**: Send password reset email

**Authentication**: None (public)

**Rate Limiting**: 2 attempts per 15 minutes per IP

**Request**:
```
POST /api/auth/request-password-reset
Content-Type: application/json

{
  "email": "admin@club.com",
  "accountType": "admin"  -- or "pilot"
}
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": { "email_sent": true }
}
```

### Route 7: GET /api/auth/validate-reset-token

**Purpose**: Validate reset token before user submits new password

**Authentication**: None

**Request**:
```
GET /api/auth/validate-reset-token?token=abc123def456&accountType=admin
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": { "valid": true }
}
```

**Error Response** (400):
```json
{
  "statusCode": 400,
  "error": "Reset token expired",
  "code": "TOKEN_EXPIRED"
}
```

### Route 8: POST /api/auth/reset-password

**Purpose**: Set new password with reset token

**Authentication**: None

**Request**:
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "abc123def456",
  "newPassword": "newsecurepass123",
  "accountType": "admin"
}
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": { "password_reset": true }
}
```

### Route 9: GET /api/contacts (Admin)

**Purpose**: List all contacts

**Authentication**: Admin Bearer token

**Request**:
```
GET /api/contacts?role=safety
Authorization: Bearer [admin_token]
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": 10,
      "name": "Jane",
      "surname": "Smith",
      "email": "jane@club.com",
      "phone": "+61412345678",
      "roles": {
        "isCommittee": false,
        "isSafetyCommittee": true,
        "isContractor": false,
        "isAdmin": false,
        "isParksVic": false
      },
      "position": "Safety Officer"
    }
  ]
}
```

### Route 10: GET /api/contacts/public/committee (Public)

**Purpose**: Return visible committee members for public display

**Authentication**: None

**Request**:
```
GET /api/contacts/public/committee
```

**Response** (200):
```json
{
  "statusCode": 200,
  "data": [
    {
      "id": 1,
      "name": "John",
      "surname": "Doe",
      "phone": "+61412345678",  -- only if displayCommittee is true
      "email": "john@club.com",  -- only if email is public
      "position": "President"
    }
  ]
}
```

---

## React Components & Hooks

### Component 1: LoginForm

**Purpose**: Admin/pilot login form with email/password inputs

**Props**:
```typescript
{
  accountType: "admin" | "pilot";  -- determines which API endpoint
  onLoginSuccess: (token: string, user: UserData) => void;
  onLoginError: (error: string) => void;
}
```

**Behavior**:
- Text input for email
- Password input
- Submit button (disabled while loading)
- Error message display
- "Forgot password?" link
- "Sign up" link (if accountType === "pilot")
- Rate limiting message (if too many failed attempts)

**Usage**:
```typescript
<LoginForm
  accountType="admin"
  onLoginSuccess={(token, user) => {
    localStorage.setItem('adminToken', token);
    navigate('/admin');
  }}
  onLoginError={(error) => toast.error(error)}
/>
```

### Component 2: SignupForm

**Purpose**: Pilot account registration form

**Props**:
```typescript
{
  onSignupSuccess: (token: string, user: UserData) => void;
  onSignupError: (error: string) => void;
}
```

**Behavior**:
- Name input
- Email input
- Password input (with strength indicator)
- Confirm password input
- Phone input (optional)
- Submit button
- "Already have account?" login link

### Component 3: ContactDirectory

**Purpose**: Display public committee/safety officer contacts

**Props**:
```typescript
{
  displayRole: "committee" | "safety";  -- which type to show
  showPhone?: boolean;  -- default: false
  showEmail?: boolean;  -- default: false
}
```

**Behavior**:
- Card grid layout
- Each contact shows name, position
- Phone/email revealed on click (if allowed)
- Responsive (1 col mobile, 2-3 cols desktop)

### Hook 1: useAuth()

**Purpose**: Access authentication context globally

**Returns**:
```typescript
{
  user: AdminUser | PilotUser | null;
  token: string | null;
  isAuthenticated: boolean;
  accountType: "admin" | "pilot" | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}
```

**Usage**:
```typescript
export function ProtectedAdminRoute() {
  const { user, accountType, isLoading } = useAuth();
  
  if (isLoading) return <Spinner />;
  if (!user || accountType !== 'admin') return <Navigate to="/admin/login" />;
  
  return <AdminDashboard />;
}
```

### Hook 2: useAuthForm()

**Purpose**: Form state management for login/signup with error handling

**Returns**:
```typescript
{
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  handleSubmit: (e: FormEvent) => Promise<void>;
  isPasswordValid: boolean;
  passwordStrength: "weak" | "medium" | "strong";
}
```

### Context: AuthContext

**Exports**:
```typescript
<AuthProvider>
  <App />
</AuthProvider>
```

**Value**:
```typescript
{
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  accountType: "admin" | "pilot" | null;
  login: (email, password, accountType) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}
```

---

## Integration Contracts

**Other workstreams depend on these and cannot proceed without them**:

### Tables Produced
- `admin_users` — Admin accounts (email PK)
- `admin_sessions` — Admin session tokens (24h TTL)
- `pilot_accounts` — Pilot accounts (email PK)
- `pilot_sessions` — Pilot session tokens (30d TTL)
- `contacts` — Contact directory with roles and visibility flags

### Routes Provided
- `POST /api/auth/login` — Admin login
- `POST /api/pilot-auth/login` — Pilot login
- `POST /api/pilot-auth/register` — Pilot signup
- `POST /api/auth/logout` — Logout (both)
- `GET /api/auth/me` — Current user (both)
- `POST /api/auth/request-password-reset` — Password reset request
- `GET /api/auth/validate-reset-token` — Validate reset token
- `POST /api/auth/reset-password` — Set new password
- `GET /api/contacts` — Admin contact list (admin auth)
- `GET /api/contacts/public/committee` — Public committee (no auth)

### Hooks Provided
- `useAuth()` — Global auth state
- `useAuthForm()` — Form state with validation

### Context Provided
- `<AuthProvider>` — Wraps entire app
- `AuthContext` — Exposes user, token, login(), logout(), isAuthenticated

### Data Format Guarantees
- All tokens: 32+ random bytes, URL-safe
- All timestamps: ISO 8601 (UTC)
- All passwords: bcrypt hash (never stored plain-text)
- Pilot token TTL: exactly 30 days (2,592,000 seconds)
- Admin token TTL: exactly 24 hours (86,400 seconds)
- Reset token: 15-minute TTL, single-use

### Middleware Provided
- `requireAuth` — Check Authorization header for valid token (admin or pilot)
- `requireAdmin` — Check Authorization header for valid admin token
- `requirePilot` — Check Authorization header for valid pilot token

### Database Constraints
- admin_users.email UNIQUE (no duplicate logins)
- pilot_accounts.email UNIQUE
- admin_sessions cascade delete on user delete
- pilot_sessions cascade delete on pilot delete
- All passwords salted + hashed (bcrypt, cost 12)

---

## Testing

### Unit Tests (server/tests/a1-auth.test.ts)

```typescript
describe('Authentication Routes', () => {
  
  describe('Admin Login', () => {
    test('POST /api/auth/login succeeds with correct credentials', async () => {
      // Create test user
      const testEmail = 'test@club.com';
      const testPassword = 'password123';
      await db.run(
        'INSERT INTO admin_users (email, password, name) VALUES (?, ?, ?)',
        [testEmail, bcrypt.hashSync(testPassword), 'Test Admin']
      );
      
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword })
      });
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.token).toBeDefined();
      expect(body.data.user.email).toBe(testEmail);
      expect(body.data.expiresAt).toBeDefined();
    });

    test('POST /api/auth/login fails with wrong password', async () => {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: 'wrongpassword' })
      });
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Invalid');
    });

    test('POST /api/auth/login enforces rate limiting (5 per 15 min)', async () => {
      // Make 6 failed attempts in succession
      for (let i = 0; i < 6; i++) {
        const res = await fetch('http://localhost:3001/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@club.com', password: 'wrong' })
        });
        
        if (i < 5) {
          expect([401, 400]).toContain(res.status);
        } else {
          expect(res.status).toBe(429);  // Too Many Requests
        }
      }
    });
  });

  describe('Pilot Registration', () => {
    test('POST /api/pilot-auth/register creates new account', async () => {
      const res = await fetch('http://localhost:3001/api/pilot-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newpilot@example.com',
          password: 'securepass123',
          name: 'Jane Pilot'
        })
      });
      
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBeDefined();
      expect(body.data.token).toBeDefined();
    });

    test('POST /api/pilot-auth/register rejects duplicate email', async () => {
      const res = await fetch('http://localhost:3001/api/pilot-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newpilot@example.com',
          password: 'securepass123',
          name: 'Jane Pilot'
        })
      });
      
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: expect.stringContaining('email')
      });
    });
  });

  describe('Session Management', () => {
    test('GET /api/auth/me returns current user with valid token', async () => {
      const res = await fetch('http://localhost:3001/api/auth/me', {
        headers: { 'Authorization': `Bearer ${validAdminToken}` }
      });
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.email).toBeDefined();
      expect(body.data.id).toBeDefined();
    });

    test('GET /api/auth/me fails without token', async () => {
      const res = await fetch('http://localhost:3001/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('Admin sessions expire after 24 hours', async () => {
      // Manually set session expiresAt to past
      await db.run(
        'UPDATE admin_sessions SET expiresAt = ? WHERE token = ?',
        [new Date(Date.now() - 1000).toISOString(), validAdminToken]
      );
      
      const res = await fetch('http://localhost:3001/api/auth/me', {
        headers: { 'Authorization': `Bearer ${validAdminToken}` }
      });
      
      expect(res.status).toBe(401);
    });

    test('POST /api/auth/logout invalidates token', async () => {
      const logoutRes = await fetch('http://localhost:3001/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${validAdminToken}` }
      });
      expect(logoutRes.status).toBe(200);
      
      // Try to use token again
      const meRes = await fetch('http://localhost:3001/api/auth/me', {
        headers: { 'Authorization': `Bearer ${validAdminToken}` }
      });
      expect(meRes.status).toBe(401);
    });
  });

  describe('Contact Directory', () => {
    test('GET /api/contacts returns all contacts (admin only)', async () => {
      const res = await fetch('http://localhost:3001/api/contacts', {
        headers: { 'Authorization': `Bearer ${validAdminToken}` }
      });
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('GET /api/contacts/public/committee returns only visible contacts (public)', async () => {
      const res = await fetch('http://localhost:3001/api/contacts/public/committee');
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      // All returned contacts should have displayCommittee = true
      body.data.forEach(contact => {
        expect(contact).toHaveProperty('position');
      });
    });
  });

  describe('Password Reset', () => {
    test('POST /api/auth/request-password-reset sends email', async () => {
      const res = await fetch('http://localhost:3001/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@club.com', accountType: 'admin' })
      });
      
      expect(res.status).toBe(200);
      // Email would be sent here (mock in test)
    });
  });
});
```

### Component Tests (src/tests/a1-auth-components.test.tsx)

```typescript
describe('LoginForm', () => {
  test('renders email and password inputs', () => {
    render(<LoginForm accountType="admin" onLoginSuccess={vi.fn()} onLoginError={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  test('calls onLoginSuccess with token on successful login', async () => {
    const onSuccess = vi.fn();
    render(<LoginForm accountType="admin" onLoginSuccess={onSuccess} onLoginError={vi.fn()} />);
    
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@club.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.any(String),  // token
        expect.objectContaining({ email: 'admin@club.com' })
      );
    });
  });
});

describe('ContactDirectory', () => {
  test('renders committee members', async () => {
    render(<ContactDirectory displayRole="committee" />);
    expect(await screen.findByText(/John Doe/i)).toBeInTheDocument();
  });

  test('hides phone by default', () => {
    render(<ContactDirectory displayRole="committee" showPhone={false} />);
    expect(screen.queryByText(/041234/i)).not.toBeInTheDocument();
  });

  test('reveals phone on click', async () => {
    render(<ContactDirectory displayRole="committee" showPhone={true} />);
    const contactCard = screen.getByText(/John Doe/i).closest('[data-contact-card]');
    await userEvent.click(contactCard);
    expect(await screen.findByText(/041234/i)).toBeInTheDocument();
  });
});
```

### Manual Testing Checklist

- [ ] Admin can log in with valid credentials
- [ ] Admin stays logged in after page refresh (localStorage token persists)
- [ ] Admin login fails with incorrect password
- [ ] "Forgot password" flow works (request + link + reset form)
- [ ] Admin token expires after 24 hours (test by setting DB expiresAt to past)
- [ ] Pilot can sign up with email/password
- [ ] Pilot can log in
- [ ] Pilot stays logged in for 30 days
- [ ] Logout clears token and redirects to login
- [ ] Public can view committee members (no auth required)
- [ ] Safety officer phone obfuscated by default, revealed on click
- [ ] Rate limiting blocks after 5 failed attempts
- [ ] No console errors or TypeScript errors
- [ ] Mobile responsive (test on 375px width)

---

## Known Gotchas

- **Password hashing is async**: Use `bcrypt.hashSync()` for consistency in migrations/seeds, but always use `await bcrypt.hash()` in routes
- **Session cleanup**: Expired sessions accumulate in database. Implement periodic cleanup job (in Foundation or here)
- **Token format**: Use `crypto.randomBytes(32).toString('hex')` for tokens (64 chars). Never use UUIDs (predictable)
- **Rate limiting**: Be careful with shared development boxes—rate limits are per IP, not per user, so multiple developers will interfere

---

## File Checklist

Deliverables (must create these):

**Server**:
- [ ] `server/migrations/001_auth.sql` — Database schema
- [ ] `server/routes/auth.ts` — Admin auth routes (login, logout, me, password reset)
- [ ] `server/routes/pilot-auth.ts` — Pilot auth routes (register, login, logout)
- [ ] `server/routes/contacts.ts` — Contact directory routes
- [ ] `server/middleware/auth.ts` — requireAuth, requireAdmin, requirePilot middlewares
- [ ] `server/utils/password.ts` — Password hashing utilities (hash, verify)

**Frontend**:
- [ ] `src/pages/admin/AdminLogin.tsx` — Admin login page
- [ ] `src/pages/PilotLogin.tsx` — Pilot login page
- [ ] `src/pages/PilotSignup.tsx` — Pilot signup page
- [ ] `src/components/auth/LoginForm.tsx` — Reusable login form component
- [ ] `src/components/auth/SignupForm.tsx` — Reusable signup form component
- [ ] `src/components/auth/ContactDirectory.tsx` — Public contact display component
- [ ] `src/contexts/AuthContext.tsx` — Auth context provider
- [ ] `src/hooks/useAuth.ts` — Auth hook
- [ ] `src/hooks/useAuthForm.ts` — Form state hook

**Tests**:
- [ ] `src/tests/a1-auth-routes.test.ts` — API route tests
- [ ] `src/tests/a1-auth-components.test.tsx` — Component tests

**Docs**:
- [ ] `A1-README.md` — Workstream setup instructions
- [ ] Inline comments for complex logic (bcrypt flows, token validation, expiry checks)

---

## Verification Checklist (Before Handoff)

**Agent: Complete ALL of these before marking workstream done**

- [ ] All files created (see File Checklist)
- [ ] Database migration applied successfully
  ```bash
  npm run seed  # Confirms DB is initialized and migrations run
  ```
- [ ] All 10 API routes tested locally
  ```bash
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@admin.com","password":"password"}'
  ```
- [ ] All tests passing
  ```bash
  npm test -- a1-auth
  ```
- [ ] No TypeScript errors
  ```bash
  npx tsc --noEmit
  ```
- [ ] No console errors in browser (F12 console)
- [ ] All routes match contract specification exactly
- [ ] All components render without errors (check in browser)
- [ ] Seed data loads (admin@admin.com, password: password auto-created)
- [ ] Default admin can log in
  ```bash
  npm run dev  # opens http://localhost:5000/admin/login
  # Log in as admin@admin.com / password
  ```
- [ ] Environment variables documented (none needed for A1 beyond Foundation)
- [ ] No hardcoded email addresses except seed admin
- [ ] Handoff document created (see below)

---

## Handoff Document

**When marking complete, provide this:**

```markdown
## A1 Auth Workstream - COMPLETE

### Summary
Implemented full authentication system for admin + pilot accounts including login, logout, password reset, sessions with TTLs, and contact directory with role-based visibility.

### Key Files
- API routes: `server/routes/auth.ts`, `server/routes/pilot-auth.ts`, `server/routes/contacts.ts`
- Components: `src/components/auth/LoginForm.tsx`, `src/components/auth/SignupForm.tsx`, `src/components/auth/ContactDirectory.tsx`
- Hooks: `src/hooks/useAuth.ts`, `src/hooks/useAuthForm.ts`
- Context: `src/contexts/AuthContext.tsx`
- Middleware: `server/middleware/auth.ts`

### Integration Points
- Routes now available for other workstreams: POST /api/auth/login, GET /api/auth/me, GET /api/contacts/public/committee
- Hooks available: useAuth(), useAuthForm()
- Middleware available: requireAuth, requireAdmin, requirePilot
- Tables populated: admin_users, admin_sessions, pilot_accounts, pilot_sessions, contacts

### Test Results
```
PASS src/tests/a1-auth-routes.test.ts (12 tests)
PASS src/tests/a1-auth-components.test.tsx (8 tests)

Test Suites: 2 passed, 2 total
Tests: 20 passed, 20 total
Time: 2.3s
```

### Database State
- Migration applied: 001_auth.sql
- Seed data loaded: 1 admin (admin@admin.com), 8 contacts with roles
- Tables created: admin_users, admin_sessions, pilot_accounts, pilot_sessions, contacts

### Known Issues
None

### Next Steps for Dependent Workstreams
- Workstream B1 (Sites) can now call `requireAuth` middleware and `useAuth()` hook
- Workstream B3 (Integrations) can now import `admin_sessions` table for TidyHQ sync
- All workstreams can protect their admin routes with `requireAuth` middleware
```

---

## Related Pages

- [[skyhigh-foundation]] — Architecture & database (read first)
- [[skyhigh-parallel-workstreams]] — Dependency graph, parallelization schedule
- [[skyhigh-workstream-template]] — Template all workstreams follow
- [[skyhigh-common-patterns]] — Reusable hooks, utilities, components
