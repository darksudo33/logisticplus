# AGENTS.md — LogisticPlus

## Product context

LogisticPlus is a logistics/business operations app being built toward a public commercial release.

The current development style is customer-driven: a real customer reports practical workflow problems, and the software is improved to solve those problems properly. Treat every task as part of building a stable sellable product, not as a quick demo.

The goal is to finish a production-ready product before selling it publicly. Code should be reliable, maintainable, migration-ready, and safe to deploy.

## Default behavior for Codex

When working on this repo:

* Inspect the existing code before changing anything.
* Follow the current architecture, naming style, folder structure, and UI patterns.
* Prefer targeted, minimal changes over large rewrites.
* Do not replace working systems unless there is a clear reason.
* Do not create duplicate components, duplicate utilities, or parallel systems when an existing one can be extended.
* Think through the full user flow, not just the single file being edited.
* Assume the app must stay usable for a real customer after every change.

## Communication style

Do not ask unnecessary confirmation questions.

Make reasonable decisions based on the repo and continue working unless the change is dangerous, destructive, security-sensitive, or ambiguous in a way that could damage production data.

Before coding, briefly state the implementation plan.

After coding, summarize:

* What changed
* Which files changed
* What tests/checks were run
* Any risks or follow-up needed
* Whether database migrations are needed
* Whether deployment steps are needed

## Migration and deployment baseline

Important: I do not want to remind Codex about migrations and deployment readiness every time.

For every feature, bug fix, or schema-related task:

* Automatically check whether the change requires a database migration.
* If a schema/model/table/column/index/relationship/permission/storage structure changes, create or update the required migration files.
* Keep migrations forward-safe and production-safe.
* Do not silently modify schema without a migration.
* Do not rely on manual database edits.
* Do not leave schema changes only in local development state.
* Include migration instructions in the final summary.
* Make sure the app can be deployed with all required migrations applied.

When I explicitly say something like “deploy”, “prepare for deploy”, “release”, “production”, or “make it ready”, assume the expected workflow includes:

* Build/check the app
* Run lint/typecheck/tests where available
* Verify environment variables/config expectations
* Apply all pending migrations using the project’s normal migration command
* Confirm the deploy path is safe
* Report anything that blocks deployment

Do not ask me every time whether migrations should be included. They should be included whenever needed.

However, do not run destructive production actions without explicit permission. This includes:

* Dropping tables
* Deleting production data
* Resetting production databases
* Force-pushing
* Rewriting migration history after it has been deployed
* Running irreversible production commands
* Removing user/customer data

If a migration may affect existing customer data, preserve the data and add a safe backfill/default strategy.

## Database rules

* Protect existing customer data.
* Prefer additive migrations over destructive migrations.
* For required new fields, use nullable/default/backfill-safe rollout when needed.
* Add indexes when new queries/search/filtering need them.
* Keep database constraints consistent with application validation.
* If changing a relationship, check all create/edit/detail/list pages that use it.
* If changing status values or enums, update all UI labels, filters, forms, and business logic.

## Deployment readiness

Every completed task should leave the app closer to production readiness.

Before saying a task is done, check for:

* Build errors
* Type errors
* Lint errors
* Broken imports
* Broken routes
* Missing migrations
* Missing environment variables
* Broken forms
* Buttons that do nothing
* Empty UI sections
* Layout overflow
* Tables requiring unwanted scrolling
* Search/filter bugs
* Permission or auth issues
* Data loss risks

If the repo has scripts such as these, use the relevant ones:

* `npm run lint`
* `npm run typecheck`
* `npm run build`
* `npm test`
* `pnpm lint`
* `pnpm build`
* `yarn build`
* framework-specific migration commands
* framework-specific test commands

If commands are unknown, inspect the repo files first, such as `package.json`, lockfiles, framework config, migration folders, Docker files, or deployment config.

## UI/UX rules

The app is for logistics users who need fast, practical workflows.

Prioritize:

* Clear forms
* Fast data entry
* Searchable fields
* Good table readability
* No unnecessary scrolling
* Mobile/tablet/desktop responsiveness where applicable
* Practical customer workflows over fancy UI

Important UI rule:

* Avoid horizontal scrolling unless explicitly requested.
* Especially for the Kootaj page/table, design so the table fits without requiring scrolling.
* Use compact columns, responsive layout, wrapping, priority columns, collapsible details, or better table structure instead of forcing the user to scroll.

For large forms, especially Shipment Details:

* Do not leave form sections empty.
* Make data fields editable.
* Support normal manual form editing.
* Also support search-based editing when there are many fields.
* Search boxes should show matching fields/results.
* Selecting a result should take the user to the correct field or allow direct editing.
* Keep the user flow simple and obvious.

## Feature relationship awareness

LogisticPlus features are connected. When changing one area, check related areas.

Important connected areas may include:

* Shipments
* Customers
* Documents
* Workflow
* Tasks
* Daily status
* Commercial cards
* Public tracking
* Billing
* SMS/notifications
* Audit logs
* Admin/platform settings
* Users, roles, and permissions
* Archive
* Search
* Object storage
* PostgreSQL/database layer

When changing a feature, consider whether related list pages, detail pages, forms, permissions, search, filters, and reports also need updates.

## Customer-driven issue handling

When I give a customer problem:

1. Understand the real workflow problem.
2. Find where it exists in the app.
3. Fix the root cause, not just the visible symptom.
4. Check related flows for the same issue.
5. Make the solution production-quality.
6. Add migration/test/deploy notes if relevant.

Do not treat customer feedback as isolated unless it truly is isolated.

## Testing expectations

For every new feature or fix, test the important buttons and flows.

At minimum, consider:

* Create
* Edit
* Save
* Cancel
* Delete/archive if available
* Search
* Filter
* Sort
* Pagination
* Open detail page
* Return/back navigation
* Form validation
* Empty state
* Loading state
* Error state
* Permission-restricted state
* Mobile/narrow layout if relevant

For new UI buttons:

* Confirm the button is visible in the correct place.
* Confirm it is clickable.
* Confirm it triggers the intended action.
* Confirm it handles success.
* Confirm it handles failure.
* Confirm it does not break nearby UI.

## Security and permissions

* Do not expose private customer data.
* Do not weaken authentication or authorization.
* Never trust client-supplied `organizationId`; derive tenant scope from the authenticated session user except for explicit platform-admin organization targeting.
* Every protected tenant-owned read and write must include `organization_id` or an explicit equivalent server-side scope.
* Public tracking responses must be built from allowlisted DTOs only.
* Document downloads must stream by server-side lookup only.
* Check role/permission behavior when adding new pages, actions, APIs, or buttons.
* Validate inputs on the server side where applicable.
* Do not trust only frontend validation.
* Avoid logging secrets, tokens, passwords, private customer information, or sensitive business data.
* Do not commit `.env` files or secrets.

## Code quality

* Keep code readable and maintainable.
* Use existing shared components/utilities when available.
* Avoid copy-paste logic.
* Keep business logic centralized when possible.
* Handle loading, error, and empty states.
* Use clear names.
* Remove dead code created by the change.
* Do not leave temporary debugging logs.
* Do not leave TODOs unless they are necessary and explained.

## Data safety

Never casually delete or overwrite:

* Customer records
* Shipment records
* Documents
* Uploaded files
* Audit logs
* Payment/billing records
* Migration files
* Environment/config files
* Production settings

Never delete migrations, schema history, or business records.

If data cleanup is needed, make it explicit and safe.

## Done criteria

A task is only complete when:

* The requested problem is fixed.
* Related user flows still work.
* Required migrations are created.
* The app builds or the relevant checks are run.
* UI does not introduce unwanted scrolling/overflow.
* Forms and buttons are functional.
* The solution is safe for customer data.
* Deployment/migration notes are included in the final response.

## Final response format

At the end of each task, respond with:

### Completed

Briefly explain what was implemented.

### Changed files

List changed files.

### Checks run

List exact commands run and results.

### Migration / deployment notes

Say whether migrations are needed.
Say whether deployment needs special steps.

### Risks / follow-up

Mention anything that still needs attention.

Do not claim tests passed unless they were actually run.
Do not claim deployment is ready unless build/checks/migrations were verified.
