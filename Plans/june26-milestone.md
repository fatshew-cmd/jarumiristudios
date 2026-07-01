# June 2026 Milestone

## Pending

- [x] Fix How It Works connector line alignment — the `h-px` absolute line may break on certain screen widths
- [x] Email confirmation to client on booking — send BR code via email (Nodemailer) so client doesn't lose it if they close the tab
- [x] Email notification to admin on new booking — same Nodemailer setup, two birds one stone
- [ ] Admin notes field on `/admin/booking/:id` — internal textarea for per-request notes, stored in DB, admin-only
- [ ] **Acceptance email to client** — triggered when admin sets status to `accepted`; includes confirmation, next steps, and a heads-up that a deposit invoice is on its way (blocked on **Stripe live API key** — `sendAcceptanceEmail` is only called inside the `send-deposit` route after Stripe invoice creation succeeds; without a live key the entire route errors out before the email fires; domain purchase is a secondary concern affecting link URLs only)
- [ ] **Deposit received notification** — email to admin + client when deposit lands; confirms work begins
- [ ] **Final payment received notification** — email to admin + client when final invoice is paid
- [x] Organize uploads by BR Code — BR code generated pre-save in the route handler; multer places files into `uploads/<brCode>/files/<type>/`; a `booking.txt` brief snapshot is written alongside
- [x] Permanent delete cleanup — resolved by design, not a purge job: admin's action was relabeled **Archive** (`POST /admin/booking/:id/archive`, `/admin/bookings/bulk-archive`) and stays a move-to-`_archive/` + `archived: true`, now with a `/admin/booking/:id/restore` and an "Archived" tab on `/admin` so it's not a dead end. Real hard deletion is client-triggered from their own dashboard/project page (`POST /dashboard/booking/:id/delete`) — permanently removes the `files/` folder (active or archived) via `hardDeleteBookingFiles()`, clears `uploadedFiles` and sets `filesDeleted: true` on the `BookingRequest`, but keeps the row and `booking.txt` as a permanent record. No scheduled purge needed since nothing auto-expires.
- [x] Deadline / delivery date field — redefined during scoping into two fields: **deposit due date**, set by admin when sending the deposit invoice (`send-deposit`, editable via `/admin/booking/:id/deposit-due-date`) and enforced by an hourly in-process job (`lib/depositExpiry.js`) that auto-declines + voids the Stripe invoice + emails client & admin if it passes unpaid; and **delivery date**, only settable once `depositStatus === "paid"` (`/admin/booking/:id/delivery-date`), shown on `/track`. No work starts, no delivery estimate, without the deposit landing.
- [ ] Admin dashboard pagination — avoid loading all bookings at once as volume grows
- [ ] `/hire` form UX improvements — live character count on project brief textarea, better mobile layout for the file upload area

## Future Tasks

### Client-facing
- [ ] Stripe payment button on `/track` — show it when status is `accepted` so clients who lose the acceptance email can still pay
- [ ] Final deliverable download on `/track` — admin uploads finished files; client downloads them from their tracking page once work is complete

### Admin QoL
- [ ] Bulk status update on dashboard — update multiple bookings at once as volume grows
- [ ] Date range filter on dashboard — filter bookings by submission date

### Reliability
- [ ] Rate limiting on `/hire` — prevent spam submissions
- [ ] Server-side file type validation on upload — currently only file size is checked; restrict to allowed MIME types
- [ ] Graceful BR code collision handling — surface a clean error if the pre-save loop somehow fails instead of crashing

### Growth
- [ ] Analytics page under `/admin` — bookings per month, revenue by tier, most requested service type

## Completed

- [x] Add favicon — 🎬 emoji favicon via SVG data URI
- [x] Add JSON-LD structured data — marked as `ProfessionalService` with name, description, contact, and service types
- [x] Build the `/hire` booking form — name, location, email, project brief, file upload (up to 250 MB), Telegram fallback, BR code on submission
- [x] Build `/track` page — lookup by BR code; alternate method via name + email combo; toggle between both methods
- [x] Build `/admin` dashboard — lists all bookings, status filter pills, live search by any field (BR code, name, email, location, services, package, status) with custom dropdown
- [x] Build `/admin/booking/:id` detail page — full booking info, status picker, contact quick actions, media links
- [x] Admin file viewer — uploaded files served via `/admin/uploads/:filename` (admin-only); images preview inline, videos play in-browser, audio plays in-browser, all files have a download button
- [x] Renamed CR Code → BR Code (Booking Request Code) across all views and copy
- [x] Hero CTA — replaced "Check Out Recent Projects" button with "Track a Project" linking to `/track`
- [x] **Stripe Invoice — deposit (30%)** — `POST /admin/booking/:id/send-deposit`; creates Stripe customer, posts invoice item, creates + finalizes + sends invoice; stores `agreedPrice`, `stripeCustomerId`, `depositInvoiceId` on booking; sets `depositStatus: pending`
- [x] **Stripe Invoice — final (70%)** — `POST /admin/booking/:id/send-final`; reuses existing Stripe customer, posts 70% invoice item, finalizes + sends; stores `finalInvoiceId`; sets `finalPaymentStatus: pending`
- [x] **Stripe webhook** — `POST /webhooks/stripe` registered before `express.json()` with raw body; verifies signature; on `invoice.payment_succeeded` advances `depositStatus`/`finalPaymentStatus` to `paid` and flips booking `status` to `in-progress` / `completed`
- [x] **BookingRequest schema additions** — `agreedPrice`, `stripeCustomerId`, `depositInvoiceId`, `finalInvoiceId`, `depositStatus` (none/pending/paid), `finalPaymentStatus` (none/pending/paid)
- [x] **Admin booking UI — payment card** — full state machine: price input + "Send Deposit Invoice (30%)" (disabled until price entered and status ≥ in-review) → "Deposit invoice sent, awaiting payment" → "Deposit received + Send Final Invoice (70%)" → "Final invoice sent, awaiting payment" → "All payments received"
- [x] **Client account system** — `User` model (bcrypt-hashed password); `/login`, `/logout`, inline `/signup` from `/hire/success` (links the just-submitted booking via crCode); `/hire` and `/login?cr=` both auto-link a booking to the logged-in/just-created account
- [x] **Client dashboard** — `/dashboard` (all bookings + payment progress), `/dashboard/new` (profile-completeness gate before starting a fresh booking), `/dashboard/booking/:id` (detail + revision requests), `/dashboard/gallery` (uploaded files across all projects), `/dashboard/account` (profile edit, password change, account deletion)
- [x] **Client-submitted revisions** — clients can post revision request messages on `/dashboard/booking/:id`; admin marks each reviewed from `/admin/booking/:id`
- [x] **In-app notifications** — `Notification` model; created on status change, invoice sent, payment confirmed, and project dismissal (account-linked bookings only); `/dashboard/notifications` page + `/api/notifications/poll` for a live unread badge
- [x] **Coupon system** — `Coupon` model (percent/fixed, optional expiry, active toggle); `/admin/coupons` CRUD UI; `/hire/coupon/validate` AJAX check + server-side re-validation on submit; discount applied to booking subtotal and reflected in `booking.txt`
- [x] **Booking archive (soft delete)** — `POST /admin/booking/:id/delete` and bulk variant set `archived: true` instead of removing the record, move the booking's `uploads/<crCode>/` folder to `uploads/_archive/`, and notify the linked client; file-serving routes check both the active and archived path
- [x] **Direct file upload replaces Telegram-only delivery** — `/hire` now accepts up to 20 files (250MB each) via `multer`, stored under `uploads/<brCode>/files/<type>/`; Telegram handle kept only as an optional fallback for oversized files
