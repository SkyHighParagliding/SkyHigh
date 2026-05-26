# Committee Photo Feature — Progress Status

**Last Updated**: 2026-05-26  
**Overall Progress**: 35% Complete (3.5 of 9 tasks)

---

## ✅ COMPLETED TASKS

### Task #1: Database Schema
- Migration 031: Added `photoUrl` and `photoAuthorised` columns
- Location: `server/pg_migrations/031_add_photo_columns.sql`
- Status: Ready to apply on next production deploy

### Task #2: Photo Service
- File: `server/services/photoService.ts`
- Features:
  - Resizes images to 300×300px using Sharp
  - Strips EXIF data automatically
  - Handles both R2 and local filesystem storage
  - Includes error handling and validation
- Status: ✅ Complete and tested

### Task #3: Photo API Endpoints
- Location: `server/routes/contacts.ts`
- Endpoints:
  - `POST /api/contacts/:id/photo` — admin-assisted upload
  - `DELETE /api/contacts/:id/photo` — delete photo
  - `POST /api/contacts/photo/self-upload` — member self-service upload
- Features:
  - Credentials validation for self-upload
  - Pre-authorization check (`photoAuthorised` flag)
  - Old photo deletion on overwrite
  - Base64 image buffer handling
- Status: ✅ Complete and tested

### Task #4 (Partial): AdminContacts Interface Update
- Location: `src/pages/AdminContacts.tsx`
- Changes:
  - Added `photoUrl` and `photoAuthorised` to Contact interface
  - Added `photoAuthorised` to emptyForm
  - Updated `openEdit()` to populate `photoAuthorised`
  - Form now includes these fields in POST/PUT
- Remaining: UI for photo checkbox and upload/delete buttons (→ Task #7)

---

## ⏳ IN PROGRESS / PENDING TASKS

### Task #5: Photo Upload Dialog Component
- **Estimated Time**: 2-3 hours
- **Dependencies**: None (standalone component)
- **What's Needed**:
  - Reusable `PhotoUploadDialog.tsx` component
  - File validation and preview
  - Consent message display
  - Mobile camera capture support (`capture="user"`)
  - Base64 encoding for upload
- **Note**: This component will be used in both Task #4 (login page) and Task #7 (admin form)

### Task #4 (Continued): Admin Login Page Integration
- **Estimated Time**: 1-2 hours
- **Dependencies**: Task #5 (PhotoUploadDialog)
- **What's Needed**:
  - Add "Update your photo" link below "Sign up as Provider"
  - New view mode: `"photo-upload"`
  - Render PhotoUploadDialog
  - Handle upload via `/api/contacts/photo/self-upload`
  - Success/error messaging

### Task #6: Photo Display on Cards
- **Estimated Time**: 1-2 hours
- **Dependencies**: None
- **Files to Update**:
  - `src/components/ContentWidgets.tsx` — CommitteeMemberCard
  - `src/pages/Safety.tsx` — SafetyOfficerCard
- **What's Needed**:
  - Display photo if `photoUrl` exists
  - 300×300px with rounded corners
  - No placeholder if missing (spec: option C)
- **Note**: photoUrl will be auto-included from API endpoint once photoUrl is added to SELECT statements

### Task #7: Admin Contacts Photo Management
- **Estimated Time**: 2-3 hours
- **Dependencies**: Task #5 (PhotoUploadDialog)
- **What's Needed**:
  - Checkbox: "Allow this member to self-upload photo" (controls `photoAuthorised`)
  - "Upload Photo" link (if `photoUrl` is null)
  - "Delete Photo" button (if `photoUrl` exists)
  - Integrate PhotoUploadDialog for admin uploads
  - Call DELETE endpoint to remove photos

### Task #8: TidyHQ Sync Protection
- **Estimated Time**: 30 minutes
- **Dependencies**: None
- **What's Needed**:
  - Find TidyHQ sync upsert logic
  - Exclude `photoUrl` from the UPDATE statement
  - Preserve member photos during sync cycles

### Task #9: End-to-End Testing
- **Estimated Time**: 2-3 hours
- **Dependencies**: Tasks #4-7 complete
- **Testing Checklist**:
  - Self-service path (login → upload → appears on cards)
  - Admin-assisted path (open contact → upload → delete)
  - Photo processing (300×300, EXIF stripped)
  - Mobile camera capture
  - TidyHQ sync protection
  - Contact deletion cleanup

---

## API Endpoints Ready

All endpoints are implemented and ready:

```bash
# Self-service member upload (no auth required, validates credentials)
POST /api/contacts/photo/self-upload
Body: { email, password, imageBuffer (base64) }
Returns: { success, photoUrl }

# Admin upload / overwrite
POST /api/contacts/:id/photo
Body: { imageBuffer (base64) }
Headers: Authorization: Bearer <token>
Returns: { success, photoUrl }

# Delete photo
DELETE /api/contacts/:id/photo
Headers: Authorization: Bearer <token>
Returns: { success }
```

---

## Next Steps

1. **Create PhotoUploadDialog component** (Task #5) — highest priority, blocks Tasks #4 and #7
2. **Integrate into admin login page** (Task #4 continued)
3. **Update admin contacts form** (Task #7)
4. **Add photo display** (Task #6)
5. **Protect TidyHQ sync** (Task #8)
6. **Test end-to-end** (Task #9)

---

## Known Issues / Blockers

None — all dependencies are either complete or in independent tasks.

---

## Storage Implementation

- **Development**: Files saved to `./uploads/contacts/photos/`
- **Production (R2)**: Files saved to `https://{R2_PUBLIC_URL}/contacts/photos/`
- **Format**: `{contactId}-{timestamp}.jpg`
- **Resolution**: 300×300px, quality 90
- **EXIF**: Automatically stripped by Sharp on resize
- **Cache**: 7 days public cache-control header

---

## Commits Made

1. `7f15313` — Add database schema and photo service
2. `053b682` — Update AdminContacts interface and form

**Ready for Production Deploy**: Yes (migrations included)
