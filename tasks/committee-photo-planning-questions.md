# Committee Photo Feature — Planning Questions

> Raised: 2026-05-19 (session 5 start)
> Status: Awaiting Jon's answers — mulling options overnight

---

## Q1 — Self-service login mechanism

Committee members currently cannot log in (login route only accepts `isAdmin=1` or `soAuthorised=1 AND isSafetyCommittee=1`). The password-reset system already supports committee members (email/token infrastructure is ready).

**Options:**

**A) Member Portal** — add `isCommittee=1` as a valid login role; show a restricted one-page "My Profile" view (photo only, no admin access); members can return any time to update their photo

**B) Magic Photo Link** — admin sends a one-time photo-upload link from the contact manager; member clicks, uploads, link expires; simpler, no new portal to build *(Claude's recommendation — reuses existing token/email infrastructure almost as-is)*

**C) Safety Officers only self-serve** — they already have a login path; committee-only members are admin-managed

**D) Other**

---

## Q2 — Photo output dimensions/ratio

**A) 3:4 portrait, 300×400px** — standard passport-ish, good for cards  
**B) 1:1 square, 300×300px** — simpler to lay out consistently on cards  
**C) 2:3 portrait, 267×400px** — slightly taller than 3:4  
**D) Other** — specify

---

## Q3 — Placeholder when no photo

**A) Initials avatar** — coloured circle with first initial (like GitHub/Google style)  
**B) Silhouette/placeholder icon** — generic person outline  
**C) Nothing** — card renders without a photo area  
**D) Other**

---

## Q4 — Photo approval for self-uploads

**A) Go live immediately** — no moderation needed  
**B) Require admin approval** — queued, admin notified by email, approves in contact manager before it goes public

---

## Items flagged for Jon to consider

1. **Privacy & consent** — Australian Privacy Act 1988 (APP 3/6). Displaying photos publicly requires consent. A checkbox "I consent to this photo being displayed publicly on the site" on upload is recommended.
2. **Photo cleanup on contact deletion** — when a contact is removed, their R2/local file won't be deleted unless we add a cleanup hook in `DELETE /contacts/:id`.
3. **TidyHQ sync protection** — sync currently overwrites name/email/phone/org. `photoUrl` must be explicitly excluded from the sync upsert so a resync doesn't wipe photos.
4. **Mobile camera capture** — self-service path should support `capture="user"` on file input so members can take a selfie on phone.
5. **Photo flagged as "pending"** — if approval is chosen (Q4-B), needs `photoPending`/`photoStatus` column, queue view in admin, and notification email. Adds scope.
6. **What happens when a member leaves** — if `isCommittee` set to 0 via TidyHQ webhook, should `photoUrl` be auto-cleared or left?
7. **EXIF stripping** — strip EXIF (GPS location, device info) before storage for privacy. Sharp does this automatically on resize.
8. **Admin notification on self-upload** — even if no approval needed, should admin get an email "Jon Smith has updated their committee photo"?

---

## Flowcharts

Full ASCII flowcharts for all three paths (self-service via Member Portal, self-service via Magic Link, admin-administered) were shared in the planning session on 2026-05-19. See conversation history.

Once Q1–Q4 are answered, the full task plan will be written into `wiki/02-tasks.md` and task prompts into `wiki/prompts/`.
