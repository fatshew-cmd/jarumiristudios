# Tech Stack

## Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Templating:** EJS
- **Styling:** Tailwind CSS v4

## Database
- **MongoDB Atlas** (free tier — 512MB)
- Managed via **Mongoose**
- Visualized locally with **MongoDB Compass**

## Authentication
- `bcrypt` for password hashing
- `express-session` for session management
- No third-party auth providers
- Two separate session flags: `req.session.isAdmin` (single shared password via `ADMIN_PASSWORD` env var, gates `/admin/*`) and `req.session.userId` (per-client `User` account, gates `/dashboard/*`)
- Client accounts are optional — bookings can be submitted as a guest via `/hire` and tracked via `/track`; an account just links bookings to a persistent dashboard

## Payments
- **Stripe** (no monthly fee — % per transaction only)
- Flow: **Stripe Invoices** (not Payment Links) — two invoices per project
  1. Admin accepts booking + sets agreed price → server creates Stripe customer + sends 30% deposit invoice
  2. Client pays → webhook fires `invoice.payment_succeeded` → booking moves to `in-progress`
  3. Work delivered → admin sends 70% final invoice
  4. Client pays → webhook fires again → booking moves to `completed`
- Invoices chosen over Payment Links for: formal paper trail, line items, auto-reminders, professional appearance

## File Delivery
- Direct upload via `multer` on `/hire` — up to 250MB per file, 20 files per submission, stored on the Railway server disk under `uploads/<brCode>/files/<video|audio|image|other>/`
- Users can also paste media links (YouTube, Google Drive, Dropbox, etc.) for content already hosted elsewhere
- Telegram handle is an optional fallback field for files too large for the 250MB upload limit
- No external/cloud object storage (S3, etc.) — disk storage on the host is the v1 tradeoff

## Email
- **Nodemailer** via Gmail SMTP (`PERSONAL_GMAIL` + app password)
- Transactional emails: booking confirmation (client), new booking alert (admin), acceptance email (client, sent alongside the deposit invoice), invoice-sent alert (admin), payment-confirmed alert (admin)

## In-app Notifications
- `Notification` model (Mongoose) — one doc per event (`status_change`, `invoice_sent`, `payment_confirmed`, `project_dismissed`), tied to a `userId` + `bookingId`
- Only created for bookings linked to a client account (`clientId` set) — guest-only bookings rely on email instead
- `/dashboard/notifications` page + lightweight polling endpoint (`/api/notifications/poll`) for a live unread badge

## Coupons
- `Coupon` model — code, `discountType` (percent/fixed), `discountValue`, optional `expiresAt`, `active` flag
- Validated both client-side (AJAX on `/hire`) and server-side (re-checked on submit) before being applied to a booking's subtotal

## Hosting
- **Railway.app** (free tier)
- MongoDB stays on Atlas (not self-hosted)

## Why these choices
- Zero monthly cost for a hobby/test project
- No data in third-party hands except Atlas (acceptable tradeoff for uptime)
- Simple stack — no React, no build pipeline complexity
- Can upgrade any piece independently when the project grows
