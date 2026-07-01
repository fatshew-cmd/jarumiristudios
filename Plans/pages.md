# Pages & Routes

## Public (no login required)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Landing | Hero, reel, services, in-page `#pricing` section (Clip/Scene/Feature/Custom + add-ons), about, footer — no standalone `/pricing` route |
| `/hire` | Request Form | Name, location, email, Telegram (optional, for large file transfers), services, pricing tier + add-ons, coupon code, project brief, media links, direct file upload (≤250MB, ≤20 files) |
| `GET /hire/success` | Post-submit | Shown to guests after submitting; offers inline account creation to track the booking going forward |
| `POST /hire/coupon/validate` | — | AJAX coupon validation for the `/hire` form |
| `POST /signup` | — | Inline signup from `/hire/success` — creates a `User`, links the just-submitted booking via `crCode`, logs in |
| `/track` | Project Tracker | Look up a booking by BR code or name + email combo |
| `/login` | Client Login | Existing client login; supports `?next=` redirect and `?cr=` to link a just-submitted booking on login |

## Authenticated (client login required)

| Route | Page | Purpose |
|-------|------|---------|
| `/dashboard` | Client Dashboard | All submitted requests, statuses, payment progress |
| `/dashboard/new` | New Project | Gated on profile completeness (name + location) before letting a client start a fresh `/hire` submission |
| `/dashboard/booking/:id` | Booking Detail | Full detail of one request; client can submit revision requests |
| `POST /dashboard/booking/:id/revision` | — | Client submits a revision request message on their booking |
| `/dashboard/gallery` | File Gallery | Browse uploaded files across all of the client's projects, sortable newest/oldest |
| `GET /dashboard/uploads/:filename` | — | Protected file serving for the owning client only |
| `/dashboard/notifications` | Notifications | In-app alerts (status changes, invoices sent, payments confirmed, project dismissed); marks all read on view |
| `POST /dashboard/notifications/mark-all-read` | — | Marks all notifications read, redirects back to the notifications page |
| `GET /api/notifications/poll` | — | Polling endpoint for live unread count + new items since a timestamp |
| `POST /api/notifications/mark-read` | — | Marks all notifications read (JSON response, used by poll-driven UI) |
| `/dashboard/account` | Account Settings | Edit profile (name, location, Telegram, account type, external link), change password, delete account |

## Admin (restricted to owner)

| Route | Page | Purpose |
|-------|------|---------|
| `/admin/login` / `/admin/logout` | — | Single shared admin password (`ADMIN_PASSWORD` env var), session-based |
| `/admin` | Admin Dashboard | Non-archived bookings with live search and status filter pills, total/pending counts |
| `/admin/booking/:id` | Booking Detail | Full booking info, status picker, payment card, media links, revision list (mark reviewed) |
| `POST /admin/booking/:id/status` | — | Update booking status + create client notification (special-cased message for `declined`) |
| `POST /admin/booking/:id/send-deposit` | — | Create/reuse Stripe customer, send 30% deposit invoice, flips status to `accepted`, sends acceptance email |
| `POST /admin/booking/:id/send-final` | — | Send 70% final invoice once deposit is paid |
| `POST /admin/booking/:id/delete` | — | Soft-delete: sets `archived: true`, moves the booking's upload folder to `uploads/_archive/`, notifies client |
| `POST /admin/bookings/bulk-delete` | — | Same archive behavior across multiple selected bookings |
| `POST /admin/booking/:id/revision/:revId/reviewed` | — | Marks a single client revision request as reviewed |
| `GET /admin/uploads/:filename` | — | Protected file serving (checks active and `_archive` paths); images inline, video/audio in-browser, download for all |
| `/admin/coupons` | Coupon Manager | List/create/toggle-active/delete coupon codes (percent or fixed discount, optional expiry) |
| `POST /webhooks/stripe` | — | Stripe webhook (raw body, signature-verified) — advances `depositStatus`/`finalPaymentStatus` on `invoice.payment_succeeded`, flips booking status, notifies client + admin |

## User Flow

```
Landing (#pricing) → /hire → Submit request (guest or logged-in client)
                       │
        guest ─────────┴───────────────────────── logged-in client
        → /hire/success (optional inline signup,    → /dashboard?submitted=<crCode>
          links booking to new account)                (booking auto-linked to account)
                       ↓
           Admin reviews in /admin → sets price → sends 30% deposit invoice via Stripe
           (status → accepted, acceptance email sent)
                       ↓
           Client pays deposit (Stripe webhook) → status → in-progress
                       ↓
           Admin does the work → client may request revisions from /dashboard/booking/:id
                       ↓
           Admin sends 70% final invoice via Stripe
                       ↓
           Client pays final (Stripe webhook) → status → completed
                       ↓
           Client tracks progress any time via /track (BR code or name + email),
           or via /dashboard if they have an account
```
