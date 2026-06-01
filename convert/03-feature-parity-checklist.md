# Feature Parity Checklist

## Launch-Critical Feature Parity

| Feature name | Current behavior | Required new behavior | Priority | Dependencies | Migration risk | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Public landing page | Persian RTL landing with product positioning and images | Next.js public landing preserving brand, pricing CTA, contact CTA | Should-have | Design system, assets | Low | Content can be improved |
| Contact requests | Public form saves `contact_requests`, admin resolves | Validated public API, spam/rate limit, admin review | Must-have | Public API, admin | Medium | Add email/SMS notification post-MVP |
| Pricing page | Starter/business/enterprise plans from frontend/backend config | DB-backed plans, public pricing, feature/limit display | Must-have | Billing, plans | Medium | Preserve IRR pricing model |
| SaaS signup | Signup creates org, owner, subscription, payment | Clean onboarding workflow with idempotent payment state | Must-have | Auth, billing, orgs | High | Needs careful migration from current states |
| Zarinpal payment | REST request/callback, sandbox/live modes, idempotent verification | Provider abstraction with Zarinpal adapter and audited callbacks | Must-have | Billing module | High | Live validation still needs controlled test |
| Password login | Email/password, bcrypt, session cookie | Email/password, Argon2id, JWT access + refresh token cookie | Must-have | Auth, users | Medium | Support migration of existing hashes or force reset |
| SMS login | Request/verify phone code, SMS.ir/dry-run, rate limits | Optional SMS OTP login, Redis/Postgres limits, audit, provider abstraction | Should-have | Auth, SMS | Medium | Preserve cost controls |
| Session restore/logout | Cookie session with `app_sessions` | Refresh-token session, logout revokes token family | Must-have | Auth | Medium | Existing session rows should not migrate |
| Protected RTL shell | Sidebar, topbar, mobile nav, skeleton loaders | Next.js app layout with RTL, mobile nav, skeleton/empty/error states | Must-have | Frontend architecture | Medium | Preserve Persian UX |
| Dashboard | Operational KPIs and quick access | Role-aware tenant dashboard with KPIs, alerts, tasks, shipment status | Must-have | Core modules | Medium | Expand reporting later |
| Shipments list | List/create/update/status/archive via store/API | Canonical shipment APIs with filters, pagination, status, archive | Must-have | Customers, auth | High | Avoid `user_records` bridge |
| Shipment detail | Detail workspace, documents, customer link, workflow/tasks | Dedicated detail page with tabs for overview, workflow, tasks, documents, tracking | Must-have | Shipments, workflow, documents | High | Preserve response semantics where useful |
| Shipment edit | Edit form for shipment details | Typed form with server validation | Must-have | Shipments | Medium | Normalize dates/types |
| Shipment statuses | `PENDING` through `CLOSED` | Controlled enum, transition rules, audit, public status events | Must-have | Shipments, audit | Medium | Add status transition policy |
| Iran import workflow | 8 phases, 66 steps, 30 blockers, route branches, public labels | Versioned workflow template engine seeded with `IR_IMPORT_CUSTOMS_V1` | Must-have | Workflow, tasks | High | Keep public/private note split |
| Workflow blockers | Open/resolve/cancel blockers | Blocker lifecycle with events, task links, notifications | Must-have | Workflow, tasks | Medium | Preserve blocker codes |
| Workflow-related tasks | Step/blocker assignments create/update tasks | Task automation rules for workflow events | Must-have | Workflow, tasks | High | Define ownership clearly |
| Public tracking token | Token generated/reset/disabled, QR/link controls | Hash-only token storage, signed customer URL, reset/disable | Must-have | Shipments, tracking | High | Do not store plaintext token |
| Public tracking search | Shipment code + email/phone verification | Same flow with rate limits and safe DTO | Must-have | Tracking, customers | Medium | Preserve customer-safe behavior |
| Public tracking detail | Shows shipment public status, public workflow summary, visible docs | Allowlisted DTO only, no internal fields | Must-have | Tracking, documents | High | Regression tests required |
| Public document download | Customer-visible docs only, tied to enabled tracking | Signed or proxied download with tenant/tracking checks | Must-have | Object storage | High | Never expose storage keys |
| Customers list/CRUD | Company/contact details, archive, targeted refresh | Tenant-scoped customer CRUD with pagination/search | Must-have | Auth, RBAC | Medium | Preserve phone/address/notes |
| Customer detail | Related shipments/documents/quotations/cheques | Related-record tabs with permission filters | Must-have | Core modules | Medium | Avoid leaking restricted modules |
| Documents bank | Upload/download/replace/archive/visibility | Object storage, version history, checksum, signed URLs, visibility | Must-have | Storage, documents | High | Add antivirus later |
| Document validation | MIME/extension allowlist, blocked executable extensions | Same plus content scanning and size policy | Must-have | Storage | Medium | Current validation is a good baseline |
| Tasks | My/team tasks, create, assign, status, events | Task module with assignment history, filters, workflow links | Must-have | Users, notifications | High | Preserve status taxonomy |
| Notifications | In-app notifications, read/read-all | In-app notifications plus queue-backed delivery channels | Should-have | Jobs, users | Medium | Needs event source |
| Global search | Tenant-scoped operational search, permission-aware | Search API with pagination, filters, normalized Persian digits/chars | Must-have | Core modules | Medium | Consider full-text indexes |
| Cheques | CRUD/status/archive/due-soon | Finance module with cheque lifecycle and reminders | Should-have | Finance permissions | Medium | Clarify enterprise priority |
| Compliance meetings | Schedule, required docs, outcome, cancel/archive | Compliance module with reminders and document requirements | Should-have | Documents, tasks | Medium | Keep if current clients use it |
| Quotations | CRUD/status/convert to shipment | Quote module with accepted/rejected/expired, convert flow | Must-have | Customers, shipments | Medium | Use "quotations" naming |
| Commercial cards | Page exists, likely legacy/store persistence | Decide rebuild as compliance/document submodule or postpone | Nice-to-have | Product decision | High | Needs verification |
| Archive | List/search/restore/permanent delete | Source `archived_at` + archive projection or view, explicit permanent delete | Must-have | All modules, audit | High | Preserve no-hard-delete rule |
| Change log | Audit list/detail | Append-only audit log with filters and detail | Must-have | Audit module | Medium | Must cover all mutations |
| User management | Tenant user CRUD, roles, suspend/activate, password reset, delete preview | Membership-based user admin with RBAC and deletion blockers | Must-have | Auth, RBAC | High | Avoid self-lockout |
| Roles/permissions | Seeded roles/permissions, backend checks, frontend guards | DB-backed RBAC with guards and policy tests | Must-have | Auth, tenancy | High | Platform role separate |
| Platform admin console | Orgs, signups, contact, plans, payments, invoices, SMS, errors | Dedicated platform admin app area with explicit platform RBAC | Must-have | Admin modules | High | Replace email gate |
| Organization management | Activate/suspend, subscription limits, billing state | Organization lifecycle and tenant settings | Must-have | Billing, RBAC | Medium | Add audit |
| Invoices/receipts | Admin invoices, void, receipts on payment | Billing module with invoice/receipt lifecycle | Must-have | Billing | High | Financial integrity required |
| Manual payment marking | Mark paid/failed with audit | Same with stricter permission and reason fields | Must-have | Billing, audit | Medium | Keep idempotent |
| SMS admin | Deliveries, analytics, templates, manual worker | SMS module, provider abstraction, queue dashboard | Should-have | Redis/BullMQ | Medium | Worker separate process |
| Error reporting | Client error reports and admin resolution | Error tracker integration plus internal issue log | Should-have | Observability | Low | Avoid PII |
| Chat | API/WebSocket exists, UI disabled | Rebuild only if product confirms | Nice-to-have | Realtime | High | Postpone by default |
| Profile/settings | Profile, password, security, notifications, theme | Account settings, security, preferences, theme/locale | Must-have | Auth | Low | Add 2FA post-MVP |
| Persian RTL/Jalali | RTL shell, Persian text, date-fns-jalali | First-class localization with `fa-IR`, RTL, Jalali utilities | Must-have | Frontend | Medium | Fix encoding pipeline |
| Skeletons/empty states | Current UX regression coverage | Standard loading, empty, error, forbidden states | Must-have | UI system | Low | Enterprise polish |
| Delete confirmations | Shared destructive confirm dialog | Confirm all destructive/archive actions | Must-have | UI system | Low | Keep async state |
| Demo company seed | Parsrah demo tenant seed | Repeatable seed for demo tenant and sample tracking | Should-have | Seed tooling | Medium | No production accidental overwrite |
| Staging validation | Liara staging smoke script | CI/staging smoke pipeline | Should-have | DevOps | Medium | Docker-first in rebuild |

## Features That Should Be Redesigned

- `user_records` bootstrap should be removed and replaced with module-specific APIs.
- Platform admin should move from hardcoded email to explicit platform roles.
- Shipment workflow should become a versioned workflow template system.
- Document storage should move from local/Liara disk to S3-compatible object storage.
- Billing should use provider abstraction, even if only Zarinpal is implemented at MVP.
- SMS worker should become a separate queue worker, not part of the web process.
- Search should use a clear search service/repository with explicit DTOs and permission filters.
- Audit logs should be generated by services/domain events rather than remembered manually.

## Features That Should Be Removed

- Plaintext customer access token storage.
- Any frontend dependency on `/api/users/:id/bootstrap`.
- Hardcoded platform admin identity.
- Production in-memory rate limiting.
- Raw public responses from internal database rows.
- Local-only assumptions around document storage.

## Features That Should Be Postponed

- Live fleet/vehicle tracking.
- Driver mobile app.
- PostGIS map views.
- Customer login portal.
- Custom workflow builder UI.
- Advanced reports and scheduled exports.
- Chat, unless a current client explicitly needs it.
- Commercial cards, unless product confirms it is required.

## Features That Should Be Improved For Enterprise Clients

- Configurable roles and permission groups.
- Tenant onboarding wizard.
- Tenant-level branding and localization settings.
- SLA and escalation rules for shipment workflow steps.
- Object storage retention and legal hold.
- Audit exports.
- Admin impersonation/support mode with explicit audit.
- Webhook subscriptions.
- API keys for tenant integrations.
- Usage metering and overage billing.
- Backup/restore reporting.

## Decision Needed

- Confirm whether the launch parity target is "all current visible routes" or "all current revenue-critical routes".
- Confirm whether public route paths must remain identical for SEO/customer links.
- Confirm whether current demo data should be recreated exactly or only as equivalent sample data.

