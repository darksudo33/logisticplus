# Frontend Architecture

## Frontend Goals

- Preserve Persian/RTL product behavior.
- Replace legacy global data hydration with feature-scoped queries.
- Make protected tenant areas easy to scan and operate for logistics teams.
- Keep public/customer tracking pages strictly separated from internal app data.
- Make loading, empty, forbidden, and error states consistent.
- Support future localization and tenant branding.

## Recommended Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- lucide-react
- TanStack Query
- React Hook Form
- Zod
- next-intl or similar localization library
- date-fns-jalali or a dedicated Jalali date utility wrapper

## Route Groups

```text
app/
  (public)/
    page.tsx
    contact/page.tsx
    pricing/page.tsx
    signup/page.tsx
    signup/pending/page.tsx
    track/[token]/page.tsx
    track/search/page.tsx
  (auth)/
    login/page.tsx
  (app)/
    layout.tsx
    dashboard/page.tsx
    shipments/page.tsx
    shipments/[id]/page.tsx
    shipments/[id]/edit/page.tsx
    customers/page.tsx
    customers/[id]/page.tsx
    tasks/page.tsx
    documents/page.tsx
    compliance-meetings/page.tsx
    cheques/page.tsx
    quotations/page.tsx
    archive/page.tsx
    search/page.tsx
    changelog/page.tsx
    profile/page.tsx
    settings/page.tsx
    management/page.tsx
  (platform-admin)/
    platform-admin/layout.tsx
    platform-admin/page.tsx
```

Compatibility redirects:

- `/admin` -> `/platform-admin`
- `/compliance` -> `/compliance-meetings`
- `/quotage` -> `/quotations`

## Layout Structure

Public layout:

- Minimal nav.
- RTL support.
- Strong call-to-action to pricing/signup/contact.

Auth layout:

- Login form.
- Password tab.
- SMS login tab.
- Rate-limit and provider-error messages.

Tenant app layout:

- Server-side auth check.
- Active tenant context.
- Sidebar.
- Topbar.
- Mobile bottom nav.
- Notifications.
- Search entry.
- Theme toggle.
- Direction set to `rtl`.

Platform admin layout:

- Separate visual shell from tenant operations.
- Platform-only guard.
- Health/status quick links.
- No tenant data unless intentionally scoped through admin screens.

## Dashboard Structure

Tenant dashboard should include:

- Shipment status KPIs.
- Overdue/blocked tasks.
- Shipments nearing free-time/demurrage risk.
- Recent public tracking updates.
- Recent documents.
- Compliance reminders.
- Cheque due-soon cards for finance roles.
- Quick links.

Platform dashboard should include:

- Active organizations.
- Pending signups.
- Contact requests.
- Paid/pending/failed payments.
- Invoice totals.
- SMS sent/failed/queued.
- Open error logs.
- Health checks.

## Auth Pages

Login requirements:

- Password login.
- SMS login code request/verify.
- Remember me.
- Clear rate-limit messaging.
- Inactive organization/subscription messaging.
- No sensitive details on invalid credentials.

Post-login:

- Load `GET /api/v1/auth/me`.
- Resolve active tenant.
- Redirect to dashboard or platform admin based on role.

## Admin Pages

Platform admin modules:

- Overview.
- Organizations.
- Organization detail.
- Manual signup.
- Signup requests.
- Contact requests.
- Billing payments.
- Invoices/receipts.
- SMS deliveries/templates/analytics.
- Error logs.
- Organization users.

Use tabs or left navigation. Keep tables dense, searchable, and filterable.

## Shared Components

Create shared components for:

- App shell and navigation.
- Data table.
- Filters toolbar.
- Status badge.
- Permission gate.
- Empty state.
- Loading skeleton.
- Error state.
- Forbidden state.
- Confirm dialog.
- File upload field.
- Jalali date/time field.
- User picker.
- Customer picker.
- Shipment picker.
- Document visibility selector.
- Public tracking preview.

## Feature Modules

Each feature should own:

- `api.ts`
- `queries.ts`
- `schemas.ts`
- `types.ts`
- `components/`
- `forms/`
- `pages` or route components

Example:

```text
features/shipments/
  api.ts
  queries.ts
  schemas.ts
  types.ts
  components/
    ShipmentStatusBadge.tsx
    ShipmentFilters.tsx
    ShipmentForm.tsx
    ShipmentDocumentsPanel.tsx
    TrackingAccessPanel.tsx
```

## UI Component Strategy

- Use shadcn/ui primitives.
- Keep app-specific wrappers in `components/app`.
- Use icons from lucide-react for actions.
- Use badges for statuses and priorities.
- Use tables for dense operational data.
- Use dialogs/drawers for create/edit where it reduces context switching.
- Use tabs inside detail pages for overview/workflow/tasks/documents/history.
- Use no decorative card-heavy marketing layout in operational screens.

## Form Handling Strategy

- React Hook Form for all forms.
- Zod schemas shared where possible with API DTO schemas.
- Server validation errors map to fields.
- Optimistic updates only for low-risk UI state, not financial/document/security actions.
- Disable submit during mutation and keep confirmation dialogs for archive/delete.

## State Management Strategy

Server state:

- TanStack Query.
- Query keys include tenant id and filters.
- Invalidate feature-specific keys after mutations.

Client state:

- Small Zustand or React context only for:
  - Theme.
  - Sidebar collapsed.
  - Locale/direction.
  - Active tenant selector.
  - Unsaved UI preferences.

Avoid:

- Large global store for shipments/customers/documents/tasks.
- Full bootstrap payloads.
- Duplicating server-owned entities in client store.

## API Client Strategy

- `lib/api/client.ts` wraps `fetch`.
- Automatically attaches access token if stored in memory.
- Handles refresh flow on 401 once.
- Parses standard response envelope.
- Throws typed `ApiError`.
- Adds `x-request-id` when helpful.
- Never sends `organizationId` in body for tenant-owned operations except platform admin context.

## Error, Loading, Empty States

Required states for every feature:

- Initial loading skeleton.
- Empty state with role-aware action.
- Validation error state.
- Forbidden state.
- Not found state.
- Network/server error with retry.
- Mutation pending state.

Public tracking errors:

- Invalid/expired token.
- No shipment match.
- Rate limited.
- Document not visible.

## Responsive Design Rules

- Desktop operational screens use dense tables and side panels.
- Mobile screens prioritize cards/lists with bottom navigation.
- Tables must have responsive alternatives or horizontal containment.
- Buttons and labels must not overflow Persian text.
- Use stable heights for nav/toolbars to prevent layout shift.

## Accessibility Rules

- Semantic headings.
- Keyboard navigable dialogs, menus, tabs.
- Focus states visible.
- Form labels and descriptions.
- Color is never the only status indicator.
- Respect reduced motion.
- Screen-reader labels for icon-only actions.

## RTL, Persian, And Localization

- Set `dir="rtl"` for Persian layouts.
- Use `fa-IR` number/date formatting.
- Centralize copy in localization files.
- Use Jalali date picker utilities.
- Normalize Persian/Arabic characters in search inputs.
- Keep source files UTF-8.
- Add tests that render key Persian text to catch encoding regressions.

## Design System Recommendations

Tokens:

- Neutral operational base.
- Semantic status colors:
  - success
  - warning
  - danger
  - info
  - muted
- Avoid one-note palettes.
- Maintain high contrast.

Components:

- `StatusBadge`
- `PriorityBadge`
- `MetricCard`
- `ActionMenu`
- `DataTable`
- `FilterBar`
- `PageHeader`
- `ConfirmDialog`
- `FileDropzone`
- `PublicSafePreview`

## Proposed Folder Structure

```text
apps/web/
  app/
  components/
    ui/
    app/
    layout/
    data-table/
  features/
    auth/
    dashboard/
    shipments/
    workflow/
    customers/
    documents/
    tasks/
    tracking/
    billing/
    admin/
    notifications/
    search/
    archive/
    audit/
  lib/
    api/
    auth/
    i18n/
    dates/
    permissions/
    formatting/
  styles/
  tests/
```

## Decision Needed

- Decide whether the first rebuild UI must exactly preserve current Persian copy or can improve terminology.
- Decide whether platform admin lives in the same Next app or a separate app package. Recommendation: same app, separate route group and guard at MVP.
- Decide whether to keep chat navigation hidden or remove it until rebuilt.

