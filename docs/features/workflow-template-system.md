# Workflow Template System

## Purpose

Shipment workflow templates move the import-customs progress flow out of hardcoded UI/server logic and into versioned, tenant-safe templates.

The V1 system keeps the existing Iran import customs workflow working while allowing admins to add optional internal steps and map shipment types to workflow definitions.

## Relationship To Form Templates

Form templates answer: which operational fields should this shipment type show?

Workflow templates answer: which process phases and steps should this shipment type follow?

They are intentionally separate because fields and process steps change at different speeds. A new field should not require a workflow version, and a workflow step should not require a schema change unless it introduces canonical data.

## Shipment Type Mapping

The default migration maps the import shipment types to the seeded system workflow template:

- `IMPORT_LENJ`
- `IMPORT_SEA_CONTAINER`
- `IMPORT_SEA_BULK`
- `IMPORT_AIR_CARGO`
- `IMPORT_LAND_TRUCK`

Runtime workflow start resolves the active template from the shipment type mapping. Non-import or unmapped shipment types do not silently receive the Iran customs workflow.

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
- Clone a system template for tenant-specific customization.
- Edit template title, description, and active status.
- Add optional custom steps to existing phases.
- Rename labels, public labels, role suggestions, expected documents, and expected form fields.
- Toggle optional step visibility and customer visibility.
- Reorder steps.
- Archive optional custom steps.
- Publish a new version and optionally map a shipment type to it.

Required seeded steps cannot be archived in V1. To remove one from normal use, hide it or make it optional in an organization-specific version.

## Runtime Behavior

Shipment Detail uses the generic shipment workflow timeline component. It still shows Iran customs route controls only when the active workflow definition declares the `iran_customs_route_v1` route rule.

Daily Status and public tracking read workflow labels from the instance snapshot when available, with a fallback to the seeded Iran import workflow for older data.

## Privacy And Permissions

Workflow template management is private and tenant-scoped.

Public tracking responses remain allowlisted. They expose only the public workflow summary and do not expose:

- template ids
- internal notes
- hidden steps
- private template metadata
- private blocker details

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

## V1 Tradeoffs

V1 focuses on safe customization of the existing import-customs workflow. It does not yet support fully custom phases from the admin UI, arbitrary route engines, approval rules, SLA automation, or workflow-level field validation.

Template steps can reference expected documents and expected form fields as metadata. Enforcement remains application-driven until the product has enough customer feedback to make those rules strict without blocking legitimate operations.

## V2 Candidates

- Admin-managed phases.
- Export/transit workflow templates.
- Workflow restore/version comparison.
- SLA due dates and overdue task creation.
- Step-level required form/document enforcement.
- Field visibility driven by workflow step.
- Role-specific workflow actions and escalation rules.
