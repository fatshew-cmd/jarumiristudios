# Journal

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
