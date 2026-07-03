# Journal

## 2026-07-03 — Minimum 3-Day Lead Time on Due Dates

**What was built:**

- Due-date validation across all four routes (`send-deposit`, `deposit-due-date`, `send-final`, `final-due-date`) previously only rejected dates in the past (`<= new Date()`) — a same-day or next-day due date was accepted. Added a shared `minDueDate()` helper (`server.js:25`, `MIN_DUE_DATE_LEAD_DAYS = 3`) computing today's UTC midnight + 3 days; all four routes now reject anything earlier than that, with an error message stating the requirement.
- Added a matching `min` attribute (client-side only, same 3-day computation) to all five date `<input>`s that feed those routes — the two `send-deposit` forms (main panel + "Accept & send deposit invoice" modal, both post to the same route), `send-final`, and the two due-date-edit forms — so the date picker itself won't offer an invalid date, though the server-side check is what actually enforces it.

**Decisions made:**
- Applied the 3-day minimum to invoice *creation* (`send-deposit`/`send-final`) as well as *editing*, even though the reported bug was specifically about editing — the same validation function backs both, and there's no reason a freshly-sent invoice should be allowed a shorter runway than an edited one.
- Verified against the live server: `Jul 5` (2 days out from "today" = Jul 3) correctly rejected with the new error; `Jul 6` (exactly 3 days out) correctly accepted — confirms the boundary is inclusive of exactly 3 days, not stricter.

---

## 2026-07-03 — No-Op Guard on Unchanged Due-Date Edits

**What was built:**

- The due-date "Update" buttons in `admin/booking.ejs` (deposit and final) are now `disabled` by default and only re-enable via `oninput` once the date picker's value differs from a `data-initial` attribute holding the currently-saved date — clicking "Update" with no actual change is no longer possible from the UI.
- Backed by a server-side guard in both `/admin/booking/:id/deposit-due-date` and `/final-due-date`: if the posted date matches the stored `depositDueDate`/`finalDueDate` exactly, the route redirects immediately, before the void/recreate/notify flow runs. This covers the button-disabling being bypassed (back/forward nav, resubmission) — a same-date submit is a true no-op, no Stripe calls, no client notification.

**Decisions made:**
- Both a client-side (UX) and server-side (correctness) guard, since the whole point was avoiding false "due date updated" notifications reaching the client — a client-only disabled-button fix doesn't survive a form resubmit.

---

## 2026-07-03 — 24-Hour Due-Date Reminders

**What was built:**

- `BookingRequest` gained `depositReminderSent`/`finalReminderSent` (bool, default `false`). `lib/invoiceExpiry.js` gained two more checks in the same hourly job: `checkUpcomingDepositReminders`/`checkUpcomingFinalReminders` find bookings whose due date falls within the next 24h (and hasn't already been reminded), flip the reminder flag first via an atomic `findOneAndUpdate` guard (same race-safe pattern as the expiry checks), then send a reminder email (`sendDepositReminderEmail`/`sendFinalReminderEmail` in `lib/mailer.js`, same "pay from your tracking page/dashboard" copy as the acceptance/due-date-updated messages) and an in-app `Notification` (new `due_date_reminder` type) if the booking has a linked account.
- Both due-date-edit routes (`deposit-due-date`, `final-due-date`) reset the corresponding `*ReminderSent` flag to `false` when they void+recreate the invoice, so moving a due date further out doesn't skip the reminder for the new date.
- Icon/color mapping for `due_date_reminder` added to `dashboard-notifications.ejs` and `_notif-poll.ejs` (alarm icon, same amber family as the other invoice-related types).
- Verified against the real DB with the mailer functions stubbed (to avoid emailing the test booking's placeholder address): set a due date 5 hours out, confirmed the job fires exactly once (flag set, notification created, email call recorded) and does not re-fire on a second run.

**Decisions made:**
- Reminder window is checked on the same hourly cadence as the expiry job rather than a separate cron, since "within 24h, hasn't fired yet" only needs coarse granularity and reuses the existing `setInterval` infrastructure.
- Reminder flags reset on due-date edit (not on payment) — once paid, the booking falls out of the `depositStatus`/`finalPaymentStatus: pending` query filter entirely, so no explicit reset is needed there.

---

## 2026-07-03 — Due-Date Timezone Fix + Stripe Invoice Sync on Edit

**What was built:**

- `endOfDay()` (`server.js:17`) parsed the admin-picked date as **server-local** time (`T23:59:59` with no offset). On the EDT-hosted server that pushed the stored instant into the next UTC calendar day (e.g. picking "Jul 10" produced `2026-07-11T03:59:59Z`), which our own pages rendered back correctly via local-time formatting but which Stripe's dashboard — reading the UTC calendar day — displayed as "Jul 11". Fixed by parsing as UTC (`T23:59:59Z`) so the stored instant's UTC day always matches what was typed.
- Separately found (while chasing a due-date-not-updating report) that `/admin/booking/:id/deposit-due-date` and `/final-due-date` only ever updated the `BookingRequest` fields in Mongo — they never touched the Stripe invoice at all, so Stripe kept showing the original due date no matter what admin changed locally.
- Confirmed against the live Stripe test API that `stripe.invoices.update()` unconditionally rejects **any** field change on a finalized/sent invoice ("Finalized invoices can't be updated in this way") — not due-date-specific, a blanket rule. So both routes were rewritten to **void the existing invoice and create+finalize+send a new one** with the new due date (same pattern `lib/invoiceExpiry.js` already uses on auto-expiry), updating `depositInvoiceId`/`depositInvoiceUrl` (and the final equivalents) to point at the new invoice.
- Verified end-to-end against the real Stripe test account: old invoice flips to `void`, new invoice's `due_date` matches the typed date exactly, Mongo stays in sync.

- `Notification` gained a `due_date_updated` type; both due-date routes now notify the client (if `clientId` is set) with the new date after the void+recreate succeeds. Icon/color mapping added everywhere notification types are rendered: `dashboard-notifications.ejs` and the live-poll partial `_notif-poll.ejs` (amber calendar-clock icon, grouped with the other invoice-related types) — previously unmapped types fell through to a red "dismiss" icon, which would've been misleading for a neutral date change.

**Decisions made:**
- Void + recreate rather than trying to special-case due-date-only edits, since Stripe doesn't offer a narrower path — this also means the old Stripe-hosted invoice link (e.g. from the original email) goes dead the moment admin edits the due date. Paired with an in-app notification (rather than a new email) since the client dashboard/`/track` already show the *current* invoice URL — the notification just tells them to go look, rather than duplicating Stripe's own invoice email.

---

## 2026-07-03 — Stripe Payment Button on `/track`

**What was built:**

- `BookingRequest` gained `depositInvoiceUrl` and `finalInvoiceUrl`, populated from Stripe's `finalized.hosted_invoice_url` at the same point `depositInvoiceId`/`finalInvoiceId` are set in `send-deposit`/`send-final` (`server.js`). `finalInvoiceUrl` is reset to `null` alongside `finalInvoiceId` when `checkExpiredFinalInvoices` voids a stale final invoice (`lib/invoiceExpiry.js`).
- `/track`'s booking lookup `.select()` now includes both URL fields. While adding them, found `finalPaymentStatus` and `finalDueDate` were never in that `.select()` either, despite `track.ejs` already reading them for its final-payment-due banner — that banner has been silently dead since it was added; fixed as part of the same change.
- "Pay deposit now" / "Pay final invoice now" buttons added to the existing due-date banners on `/track`, linking directly to the stored Stripe hosted invoice URL.
- Same pattern extended to the client's own account views, which already had "Invoice sent — check your email" copy with no way to act on it: `dashboard-booking.ejs` (project detail sidebar) gets the same "Pay deposit now"/"Pay final invoice now" buttons under each line item; `dashboard.ejs` (project list) gets a green "Pay now" icon action in the row's CTA cluster (`/dashboard` route's `populate` select gained `depositInvoiceUrl`/`finalInvoiceUrl` to support it). Neither route needed a new query — `/dashboard/booking/:id` already fetched the full document.
- `sendAcceptanceEmail` (`lib/mailer.js`) copy updated to mention the `/track` fallback (and `/dashboard` too, if the booking has a linked `clientId`) as a way to pay the deposit if the Stripe invoice email itself gets lost.

**Decisions made:**
- Store the hosted invoice URL at invoice-creation time rather than fetching it from Stripe on each `/track` request — it's static until the invoice is paid or voided, and this avoids an extra Stripe API call on every page load.
- Deposit expiry (`checkExpiredDeposits`) doesn't reset `depositInvoiceId`/`depositStatus` on decline (pre-existing behavior), so `depositInvoiceUrl` is left alone there too for consistency — it's harmless since the button is gated on `status === 'accepted'`, which flips to `declined` on expiry.

---

## 2026-07-03 — In-App Admin Notifications, Nudge Rate Limiting, Client Booking Page Overhaul

**What was built:**

- New `AdminNotification` model (`bookingId`, `crCode`, `type` (currently only `"nudge"`), `message`, `read`) replaces the old email-based nudge alert. `POST /dashboard/booking/:id/nudge` now writes an `AdminNotification` instead of calling `sendAdminNudgeAlert` (removed from `lib/mailer.js` entirely).
- Nudge rate limiting: max 3 nudges per booking per rolling hour, counted via `AdminNotification.countDocuments` on `type: "nudge"` + `createdAt` in the last hour. Over the limit returns `429` with a JSON error message; client dashboard JS (single and bulk nudge) surfaces it instead of a generic failure.
- Admin notification bell: `/admin/notifications` (lists latest 200, marks all read on view), `GET /api/admin/notifications/poll?since=<ts>` (unread count + new items since a timestamp), `POST /api/admin/notifications/mark-read`. A shared `views/admin/_notif-poll.ejs` partial polls every 15s, updates an unread-count badge next to a "Notifications" link, and toasts new nudges in real time; included on `admin/dashboard.ejs`, `admin/booking.ejs`, and `admin/coupons.ejs`. An `app.use("/admin", ...)` middleware injects `res.locals.adminUnreadCount` on every admin request.
- Session store switched from the default in-memory `express-session` store to `connect-mongo` (`MongoStore.create({ mongoUrl: process.env.MONGO_URI })`) — sessions now survive server restarts/redeploys instead of forcing re-login.
- Client dashboard booking detail page (`views/dashboard-booking.ejs`) reworked into a two-column layout: main content left, sticky payment/status sidebar right (was a single centered column with payment status inline near the top). Submitted files section is now collapsible and grouped by media type (Video/Audio/Image/Other) instead of one flat list.
- `POST /dashboard/booking/:id/delete` (client hard-delete) now also sets `archived: true` and moves the booking's upload folder into `uploads/_archive/` in addition to the existing `hardDeleteBookingFiles()` call — a deleted project also drops out of the active admin view rather than lingering there with its files gone.

**Decisions made:**
- In-app + polling over email for nudges — email was already the fallback for guests, but for account-linked admin alerts a persisted, rate-limited record is cheaper to spam-guard than an inbox and gives a visible history (`/admin/notifications`).
- Rate limit is per-booking, not global — a client hammering nudge on one stuck project shouldn't affect their (or anyone else's) ability to nudge on a different one.
- `AdminNotification.type` is an enum with only `"nudge"` today — left room to add more admin-facing event types later without a schema migration.

---

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
