# Committee Photo Feature — Implementation Guide

**Status**: In Progress  
**Completed**: Tasks 1-4 (database, service, API, AdminContacts interface)  
**Remaining**: Tasks 5-9

---

## Task #5: Create Photo Upload Dialog Component

**File**: `src/components/PhotoUploadDialog.tsx` (NEW)

```tsx
import { useState } from "react";
import { X, Upload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (imageBuffer: string) => Promise<void>; // base64
  isLoading?: boolean;
  contactName?: string;
}

export function PhotoUploadDialog({
  isOpen,
  onClose,
  onUpload,
  isLoading = false,
  contactName = "this contact",
}: PhotoUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState("");
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file is an image
    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, or WebP)");
      return;
    }

    // Validate file size (max 5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB");
      return;
    }

    setFile(selectedFile);
    setError("");

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setError("");
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        await onUpload(base64);
        setFile(null);
        setPreview("");
        onClose();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-lg font-bold text-navy">Upload Photo</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Preview */}
          {preview && (
            <div className="mx-auto w-32 h-32 rounded-lg overflow-hidden border-2 border-border">
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}

          {/* File Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Select Image
            </label>
            <div className="relative border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileSelect}
                disabled={isLoading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="pointer-events-none space-y-2">
                <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Click to select or take a photo
                </p>
              </div>
            </div>
          </div>

          {/* Consent Message */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Important:</strong> By uploading this image you consent to it being displayed. Do not press upload if you do not consent.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || isLoading}
              className="flex-1 bg-navy hover:bg-navy-light text-white"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" /> Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Key Points**:
- Reusable component for both login page and admin form
- File validation (type, size)
- Preview before upload
- Consent message (required per spec)
- Mobile camera capture support via `capture="user"`
- Handles base64 encoding for transmission

---

## Task #4 (Continued): Update Admin Login Page

**File**: `src/pages/AdminLogin.tsx`

1. Add new view type: `"photo-upload"` to the View union
2. Add state for photo upload: `showPhotoUpload`, `photoError`
3. Add link below "Sign up as Provider":
   ```tsx
   <button
     type="button"
     className="w-full text-sm text-muted-foreground hover:text-navy transition-colors py-1"
     onClick={() => switchView("photo-upload")}
   >
     Update your photo
   </button>
   ```
4. Create new view component (after provider-signup) that renders `PhotoUploadDialog`
5. Handle upload via `/api/contacts/photo/self-upload` endpoint
6. Show success/error messages

---

## Task #7: Add Photo Authorization Checkbox in Admin Contacts

**File**: `src/pages/AdminContacts.tsx`

1. Find the role checkboxes section (around line 700)
2. Add checkbox for "Allow self-service photo upload":
   ```tsx
   <label className="flex items-center gap-2 cursor-pointer text-sm">
     <input
       type="checkbox"
       checked={form.photoAuthorised}
       onChange={e => setForm(prev => ({ ...prev, photoAuthorised: e.target.checked }))}
       className="rounded border-border"
     />
     <span>Allow this member to self-upload photo</span>
   </label>
   ```
3. Add "Upload Photo" link (if no photoUrl):
   ```tsx
   {!editingId && !form.photoUrl && (
     <button
       type="button"
       className="text-sm text-sky hover:text-navy"
       onClick={() => setShowPhotoUploadDialog(true)}
     >
       Upload Photo
     </button>
   )}
   ```
4. Add "Delete Photo" button (if photoUrl exists):
   ```tsx
   {editingId && form.photoUrl && (
     <button
       type="button"
       className="text-sm text-red-600 hover:text-red-700"
       onClick={() => handleDeletePhoto()}
     >
       Delete Photo
     </button>
   )}
   ```
5. Integrate `PhotoUploadDialog` component for admin-assisted uploads
6. Add `handleDeletePhoto` function to call `DELETE /api/contacts/:id/photo`

---

## Task #6: Add Photo Display to Committee/Safety Officer Cards

### File A: `src/components/ContentWidgets.tsx`

1. Update `CommitteeMember` interface to include `photoUrl?: string`
2. Modify `CommitteeMemberCard` component to display photo:
   ```tsx
   {member.photoUrl && (
     <div className="mx-auto mb-3">
       <img
         src={member.photoUrl}
         alt={displayName}
         className="w-20 h-20 rounded-lg object-cover border-2 border-border"
       />
     </div>
   )}
   ```
3. Position photo above the name

### File B: `src/pages/Safety.tsx`

1. Update `SafetyOfficer` interface to include `photoUrl?: string` (already added in types)
2. Modify `SafetyOfficerCard` component similarly
3. Match styling with committee cards

---

## Task #8: Protect photoUrl from TidyHQ Sync

**File**: `server/services/tidyhqService.ts` (or similar)

Find the contact upsert/sync logic:
```ts
// BEFORE (overwrites everything):
await db.prepare("UPDATE contacts SET name=?, surname=?, email=?, phone=?, organisation=? WHERE id=?")
  .run(firstName, lastName, email, phone, organisation, contactId);

// AFTER (preserve photoUrl):
const contact = await db.prepare("SELECT photoUrl FROM contacts WHERE id=?").get(contactId);
// Then upsert WITHOUT touching photoUrl
```

Key: When syncing from TidyHQ, exclude `photoUrl` from the UPDATE so member-uploaded photos aren't deleted.

---

## Task #9: End-to-End Testing Checklist

Test both paths:

### Path A: Self-Service Upload (via Login)
- [ ] Click "Update your photo" on admin login page
- [ ] Enter email/password
- [ ] Select image file
- [ ] See preview
- [ ] Click Upload → photo appears on cards
- [ ] Test with mobile camera capture (`capture="user"`)

### Path B: Admin-Assisted Upload
- [ ] Admin logs in
- [ ] Opens contact with no photo
- [ ] Clicks "Upload Photo" link
- [ ] Selects image
- [ ] Photo saved and displayed
- [ ] Admin can delete photo via "Delete Photo" button

### Verification
- [ ] Photo is 300×300px when saved
- [ ] EXIF data is stripped (use exiftool to verify)
- [ ] Consent message is visible and clear
- [ ] Photo appears on committee cards immediately
- [ ] Photo appears on safety officer cards immediately
- [ ] TidyHQ sync doesn't delete photos
- [ ] Deleting a contact removes the photo file from R2/uploads/
- [ ] Mobile camera capture works on iOS/Android

---

## Implementation Order (Recommended)

1. ✅ Task 1-4: Backend + AdminContacts (DONE)
2. **Task 5**: PhotoUploadDialog component (2-3 hours)
3. **Task 4 cont**: Admin login page integration (1-2 hours)
4. **Task 7**: Admin contacts photo checkbox + upload (2-3 hours)
5. **Task 6**: Add photo display to cards (1-2 hours)
6. **Task 8**: TidyHQ sync protection (30 min)
7. **Task 9**: End-to-end testing (2-3 hours)

**Estimated Total**: 10-16 hours

---

## Notes

- All endpoints require base64-encoded image data
- Sharp library handles EXIF stripping automatically on resize
- Storage key format: `contacts/photos/{contactId}-{timestamp}.jpg`
- Default authorization: `photoAuthorised = 0` (admin must enable)
- No approval queue needed (goes live immediately)
