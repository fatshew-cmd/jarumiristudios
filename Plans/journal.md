# Journal

## 2026-07-02 — Pause/Nudge Routes, Final Invoice Expiry, Stale-Payment Webhook Guard

**What was built:**

- Fixed the dead "Pause project" / "Nudge admin" buttons found last session: `POST /dashboard/booking/:id/pause` (sets a new `paused` status, emails admin) and `/nudge` (emails admin, no status change) now exist. `paused` styling/labels added across client dashboard, admin dashboard, admin booking status picker, and `/track`.
- `BookingRequest` gained `finalDueDate`, mirroring `depositDueDate`. `POST /admin/booking/:id/send-final` now requires an admin-chosen due date (was hardcoded `days_until_due: 7`); editable afterward via `POST /admin/booking/:id/final-due-date`. Shown to the client on `/track`.
- `lib/depositExpiry.js` renamed to `lib/invoiceExpiry.js` and gained `checkExpiredFinalInvoices`: past `finalDueDate` with `finalPaymentStatus: pending`, it voids the Stripe final invoice and resets `finalPaymentStatus`/`finalInvoiceId`/`finalDueDate` to `none`/`null` (unlike the deposit path, it does **not** touch `status` — project stays wherever it was, e.g. `in-progress`) so admin can send a fresh invoice without a dead end.
- Hardened the `invoice.payment_succeeded` webhook: it used to blindly set `status` to `in-progress`/`completed` on any matching invoice ID. Now it checks whether the booking is `archived`/`declined`/`paused` first — if so, the payment is still recorded but `status` is left alone and admin gets a distinct `sendAdminUnexpectedPaymentAlert` instead of the normal payment alert, so a payment landing on a stale link (e.g. paused/declined *after* the invoice was sent but before it expired) doesn't silently resurrect the project.

**Decisions made:**
- Void-on-expiry over allow-late-payment for final invoices too, for consistency with the deposit flow.
- Final invoice expiry doesn't decline the project (unlike deposit expiry) — by the time a final invoice exists, work is already done/in progress, so "declined" doesn't fit. Just void + reset + let admin decide.
- Didn't add proactive invoice-voiding on manual status changes (admin declining, client pausing) — the webhook guard covers the resulting risk (money already moved, so voiding after the fact doesn't help anyway) without adding that extra wiring. Flagged as a possible follow-up, not built.

---

## 2026-07-01 — Deposit Due Date, Delivery Date, Auto-Decline Job

**What was built:**

- `BookingRequest` gained two fields: `depositDueDate` (set by admin when sending the deposit invoice) and `deliveryDate` (only settable once `depositStatus === "paid"`)
- The deposit invoice's Stripe `due_date` is now the admin-chosen date instead of the old hardcoded `days_until_due: 7`; editable afterward via `POST /admin/booking/:id/deposit-due-date` while still pending
- `POST /admin/booking/:id/delivery-date` lets admin set/clear a delivery estimate once the deposit is paid; shown to the client on `/track`
- `lib/depositExpiry.js` — an hourly in-process `setInterval` job (started from the `mongoose.connect().then()` callback, no external cron) that finds bookings still `accepted`/`depositStatus: pending` past their `depositDueDate`, auto-declines them, voids the Stripe deposit invoice, and emails both client (`sendDepositExpiredEmail`) and admin (`sendAdminDepositExpiredAlert`)
- Client dashboard: renamed "Cancel" → "Delete" everywhere (it always hard-deleted files, the label was just wrong); added an `archived` status pill; bulk "Pause"/"Nudge" actions now filter to `manageableIds` (excludes archived/declined/completed rows) before firing

**Decisions made:**
- Redefined the old vague "deadline / delivery date field" backlog item into two separate concepts — a deposit deadline that protects the admin from unpaid-but-accepted bookings sitting in limbo, and a delivery estimate that's meaningless to promise before the deposit lands
- No work starts and no delivery estimate is shown without the 30% deposit landing first

**Found while documenting, not yet fixed:** the client dashboard's "Pause project" and "Nudge admin" buttons (single-row and bulk) call `POST /dashboard/booking/:id/pause` and `/nudge`, but no such routes exist in `server.js` — this predates this session's work. Logged in `june26-milestone.md`.

---

## 2026-07-01 — Admin Notes, Archive Rename, Client File Deletion

**What was built:**

- `BookingRequest` gained `adminNotes` (array of `{ text }`) and `filesDeleted` (bool)
- Admin notes: `POST /admin/booking/:id/notes` (add), `/notes/:noteId/edit`, `/notes/:noteId/delete` — internal, per-booking, never shown to the client
- Admin's soft-delete action was renamed delete → **archive**: `POST /admin/booking/:id/archive` and `/admin/bookings/bulk-archive` (was `/delete` and `/bulk-delete`); adds `POST /admin/booking/:id/restore` and an Active/Archived tab on `/admin` (`?view=archived`) so archived bookings stay reachable instead of disappearing
- Client-side hard delete: `POST /dashboard/booking/:id/delete` — the client's own "Delete project" action now actually destroys the uploaded files (`hardDeleteBookingFiles()`), clears `uploadedFiles`, sets `filesDeleted: true`; the booking row and `booking.txt` snapshot are kept as a permanent record
- Same commit reconciled `pages.md`, `landing-page.md`, `june26-milestone.md`, `stack.md` against the `server.js` state as of 2026-06-30 (see reconciliation entry below) — but did not catch its own new routes (notes/archive rename/restore/client-delete) in that pass, so those went undocumented until this entry

**Decisions made:**
- Two separate removal actions, not one: admin "archive" only unclutters `/admin` and is always reversible; only the client can trigger a real, permanent deletion of their own files. See `project_delete_vs_archive` memory for the full reasoning.
- No scheduled purge job for `uploads/_archive/` — archived files must stay retrievable indefinitely.

---

## 2026-06-30 — Planning Docs Reconciled With Implementation

**What was found:** `pages.md`, `landing-page.md`, and `june26-milestone.md` had drifted well behind `server.js` — several full subsystems existed in code with no record in the plans:

- Client account system (`User` model, `/login`, `/signup`, `/dashboard/*`) — bookings can be submitted as a guest and optionally linked to a persistent account
- `/dashboard/new`, `/dashboard/gallery`, `/dashboard/account`, `/dashboard/notifications` pages, plus client-submitted revision requests on `/dashboard/booking/:id`
- `Notification` model + `/api/notifications/poll` live-badge system
- `Coupon` model + `/admin/coupons` CRUD, applied on `/hire`
- Soft-delete/archive flow for bookings (`archived` flag + `uploads/_archive/` move) instead of hard deletion
- Direct file upload via `multer` (250MB/file, 20 files) replaced the originally-planned Telegram-only delivery model from `stack.md`; Telegram is now just a fallback for oversized files
- No standalone `/pricing` route — pricing lives in the `#pricing` section of `/`
- Landing page also has `#process` (How It Works) and `#career` (recruiting) sections never recorded in `landing-page.md`

**What changed:** Updated all four docs to match current `server.js`/model/view state. No code changes made.

---

## 2026-06-30 — Upload Directory Reorganization

**What was built:**

- File uploads are now organized by BR code: `uploads/<brCode>/files/<type>/` — each booking gets its own folder with subfolders for `video/`, `audio/`, and `image/`
- A `booking.txt` plain-text snapshot of the project brief is written to `uploads/<brCode>/` at submission time — quick reference without hitting the DB
- BR code is generated in the route handler before the multer upload runs so the destination callback can resolve the correct folder path at upload time

**Decisions made:**
- `uploads/<brCode>/files/<type>/` structure makes it trivial to delete an entire project's files atomically when a booking is removed
- `booking.txt` lives alongside `files/` rather than inside it to keep admin-written meta separate from client-uploaded assets
- Legacy flat files in the `uploads/` root from before the migration are left in place; new bookings all use the organized structure

---

## 2026-06-28 — Stripe Payment Flow

**What was built:**

- `POST /admin/booking/:id/send-deposit` — creates a Stripe customer for the client, posts a 30% invoice item, creates + finalizes + sends the hosted invoice; stores `agreedPrice`, `stripeCustomerId`, `depositInvoiceId` on the booking and sets `depositStatus: pending`
- `POST /admin/booking/:id/send-final` — reuses the existing Stripe customer, posts the remaining 70% invoice item, finalizes + sends; stores `finalInvoiceId` and sets `finalPaymentStatus: pending`
- `POST /webhooks/stripe` — registered before `express.json()` (uses `express.raw`) to allow Stripe signature verification; handles `invoice.payment_succeeded`; looks up booking by `metadata.crCode`; on deposit paid → `depositStatus: paid`, `status: in-progress`; on final paid → `finalPaymentStatus: paid`, `status: completed`
- BookingRequest schema extended with `agreedPrice`, `stripeCustomerId`, `depositInvoiceId`, `finalInvoiceId`, `depositStatus` (none/pending/paid), `finalPaymentStatus` (none/pending/paid)
- Admin booking payment card — full UI state machine in `/admin/booking/:id`: price input + "Send Deposit Invoice (30%)" (disabled until price > 0 and booking status ≥ in-review) → awaiting deposit → deposit received + "Send Final Invoice (70%)" → awaiting final → "All payments received"; JS validates price input live before enabling the submit button

**Decisions made:**
- Deposit button is gated on booking status being `in-review`, `accepted`, or `in-progress` — prevents accidentally invoicing a still-`pending` submission
- Stripe `collection_method: send_invoice` with `days_until_due: 7` — Stripe handles emailing the client the hosted payment link automatically, so no custom email needed for the payment step

---

## 2026-06-15 — Admin, Tracking & File Viewing

**What was built:**

- `/track` page — clients can look up their request by BR code or by name + email combo; both methods toggle with a link below the form
- `/admin` dashboard — table of all bookings with live client-side search (any field: BR code, name, email, location, services, package, status) and status filter pills; search uses a custom-styled dropdown, not native `<select>`
- `/admin/booking/:id` — full booking detail: client info, project brief, status picker (post form), media links, quick actions (email / Telegram)
- Admin file viewer — files stored in `uploads/` are now served via a protected route `/admin/uploads/:filename`; images render inline, videos and audio play in-browser, everything has a download button
- Renamed CR Code (Client Request Code) → BR Code (Booking Request Code) everywhere: views, copy, labels
- Hero CTA on landing page changed from "Check Out Recent Projects" (anchor) to "Track a Project" → `/track`

**Decisions made:**
- File serving is admin-only (`requireAdmin` middleware) with `path.basename()` to block path traversal
- Alternate track lookup (name + email) uses case-insensitive regex on name + lowercase email match
- Admin search is fully client-side — all rows carry `data-*` attributes; no server round-trip per keystroke

---

## 2026-06-13 — Initial Planning Session

Defined the full concept and stack for Jarumiri Studios.

**What we decided:**
- Video editing studio site — allow clients to hire me as an editor
- Built with Express + EJS + Tailwind + MongoDB Atlas + Railway hosting
- Stripe for payments, Telegram for raw file delivery
- No third-party auth, no self-hosted storage for v1
- Clean and minimal design direction

**What we ruled out and why:**
- React — unfamiliar, overkill for now
- Supabase / Firebase — don't want data in third-party hands
- Self-hosted MongoDB — uptime depends on PC being on
- Self-hosted file storage (external drive / NAS / MinIO) — home upload bandwidth is the bottleneck, not storage hardware
- Torrenting for file delivery — too technical for average clients
- VPS for storage — cost

**Reference files created:**
- `stack.md` — full tech stack and reasoning
- `pages.md` — all routes and user flow
- `landing-page.md` — landing page section breakdown
