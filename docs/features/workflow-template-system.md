# Workflow Template System

## Purpose

Shipment workflow templates move shipment progress flows out of hardcoded UI/server logic and into versioned, tenant-safe templates.

The V1 system keeps the existing Iran import customs workflow working, seeds predefined templates for each supported import/export shipment variation, and lets admins customize those existing templates. V1 intentionally does not expose a blank "create workflow from scratch" builder.

## Customs Step Catalog

Migration `20260604123000_workflow_step_catalog_and_archives.sql` adds `shipment_workflow_step_catalog`, a reusable step library. The production seed keeps the global system catalog idempotently populated with 64 Iran import customs steps grouped into:

- intake
- documents
- permits
- declaration
- routing
- inspection
- payments
- release
- exit
- closure

System catalog steps are shared presets. Tenant admins can add them to templates, but tenant edits happen on template step snapshots or tenant-owned templates; they do not destructively edit the global catalog.

Template steps now optionally store `catalog_step_id`. The step row still stores labels, visibility, checklist, required documents, and form-field metadata so a workflow instance can snapshot the template at start time. Later catalog changes do not rewrite existing shipment workflow history.

## Relationship To Form Templates

Form templates answer: which operational fields should this shipment type show?

Workflow templates answer: which process phases and steps should this shipment type follow?

They are intentionally separate because fields and process steps change at different speeds. A new field should not require a workflow version, and a workflow step should not require a schema change unless it introduces canonical data.

## Shipment Type Mapping

The default migrations seed one workflow template for each supported shipment type:

- `IMPORT_LENJ`
- `IMPORT_SEA_CONTAINER`
- `IMPORT_SEA_BULK`
- `IMPORT_AIR_CARGO`
- `IMPORT_LAND_TRUCK`
- `EXPORT_LENJ`
- `EXPORT_SEA_CONTAINER`
- `EXPORT_SEA_BULK`
- `EXPORT_AIR_CARGO`
- `EXPORT_LAND_TRUCK`

Runtime workflow start resolves the active template from `shipment_type_workflow_templates`. The legacy `IR_IMPORT_CUSTOMS_V1` template remains available for existing started instances and compatibility, but new shipments use the active shipment-type mapping. Existing workflow instances are never rewritten when mappings change.

## Template Versions And Snapshots

Workflow templates are immutable once published. Admin edits clone the system/global template into an organization-scoped template when needed.

When a workflow instance starts, LogisticPlus stores:

- template id
- template code
- template version
- workflow definition snapshot JSON

Existing workflow instances keep their step states, blockers, history, route, notes, and public projection. They read from their stored snapshot so later template edits do not rewrite completed customer work.

## Admin Behavior

Admins with `shipment_workflows.manage` can manage templates at `/admin/workflow-templates`.

Supported V1 actions:

- View seeded and organization-specific workflow templates.
- Edit a seeded template, which forks it into an organization-scoped customization when needed.
- Edit template title, description, and active status.
- Add optional custom steps to existing phases.
- Search and filter the customs step catalog.
- Add one or many existing customs catalog steps to a template.
- Rename labels, public labels, role suggestions, expected documents, and expected form fields.
- Override required/customer-visible/checklist metadata per template step.
- Toggle optional step visibility and customer visibility.
- Reorder steps.
- Archive optional custom steps.
- Archive tenant-owned templates.
- Hard delete only unused tenant-owned templates.
- Publish a new version and optionally map a shipment type to it.

Not supported in V1:

- Creating a totally new workflow template from a blank builder.
- Creating workflows unrelated to the supported shipment type catalog.
- Replacing the migration-seeded global templates with destructive edits.
- Hard-deleting system templates or templates referenced by shipments, active mappings, or audit history.

Required seeded steps cannot be archived in V1. To remove one from normal use, hide it or make it optional in an organization-specific version.

## Runtime Behavior

Shipment Detail uses the generic shipment workflow timeline component. It still shows Iran customs route controls only when the active workflow definition declares the `iran_customs_route_v1` route rule.

Daily Status and public tracking read workflow labels from the instance snapshot when available, with a fallback to the seeded Iran import workflow for older data.

## Privacy And Permissions

Workflow template management is private and tenant-scoped.

Public tracking responses remain allowlisted. They expose only the public workflow summary and do not expose:

- template ids
- template codes or versions
- internal step keys
- task policies
- required document/form metadata
- organization ids
- user ids
- internal notes
- hidden steps
- private template metadata
- private blocker details
- workflow blockers/tasks/audit internals

Every protected workflow template read/write is scoped server-side by the authenticated tenant. Client-supplied organization ids are not trusted.

## Schema And Migrations

Migration `20260603210000_shipment_workflow_templates.sql` adds:

- `shipment_workflow_templates`
- `shipment_workflow_template_phases`
- `shipment_workflow_template_steps`
- `shipment_type_workflow_templates`
- workflow template snapshot columns on `shipment_workflow_instances`
- indexes and uniqueness constraints
- default import workflow template seed data
- `shipment_workflows.manage` permission

The migration is additive and backfills existing Iran import workflow instances with snapshot metadata without changing customer workflow state.

Migration `20260604110000_predefined_shipment_workflow_templates.sql` adds the predefined import/export shipment type templates and updates global shipment type mappings for future workflow starts. It is additive and idempotent, and it does not update existing `shipment_workflow_instances`.

Migration `20260604123000_workflow_step_catalog_and_archives.sql` adds:

- `shipment_workflow_step_catalog`
- `shipment_workflow_template_steps.catalog_step_id`
- `shipment_workflow_template_steps.checklist_json`
- `shipment_workflow_templates.archived_by_id`
- `shipment_workflow_templates.archived_reason`
- safe catalog/template indexes
- the 64-step system customs catalog
- the catalog-backed `IR_IMPORT_CUSTOMS_V1` template definition

Existing shipment workflow instances are not rewritten by this migration.

## Empty Workflow Reset Script

`scripts/reset-empty-shipment-workflows-to-default.ts` repairs blank workflow instances after deployment.

Rules:

- Dry-run is the default.
- `--apply` is required to mutate.
- Scope is required with `--organization-id=<id>` or explicit `--all-tenants`.
- Workflows with user activity, blockers, linked tasks, or touched step states are skipped.
- The script resets only blank instances to the active default template for the shipment type.

Recommended production sequence:

1. Run migrations.
2. Run `npm run seed:production-core`.
3. Run `npm run verify:fresh-production`.
4. Run `npm exec tsx scripts/reset-empty-shipment-workflows-to-default.ts -- --all-tenants` and review output.
5. Run the same command with `--apply` only after the dry-run shows only blank workflows.

## V1 Tradeoffs

V1 focuses on safe customization of seeded shipment-type workflows. It does not yet support fully custom phases from the admin UI, arbitrary route engines, approval rules, SLA automation, or workflow-level field validation.

Template steps can reference expected documents and expected form fields as metadata. Enforcement remains application-driven until the product has enough customer feedback to make those rules strict without blocking legitimate operations.

## V2 Candidates

- Admin-managed phases.
- Brand-new workflow templates from scratch.
- Transit/domestic workflow templates.
- Workflow restore/version comparison.
- SLA due dates and overdue task creation.
- Step-level required form/document enforcement.
- Field visibility driven by workflow step.
- Role-specific workflow actions and escalation rules.
