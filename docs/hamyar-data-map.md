# Hamyar Data Map

This document maps the current LogisticPlus data that Hamyar may use. Hamyar should treat live tools and tenant-scoped repositories as source of truth; Company Brain is only a candidate/snapshot layer unless a field policy explicitly says otherwise.

## 1. Organization

Fields currently available:
- Organization identity: `organizations.id`, `name`, `slug`, `status`, plan/subscription fields.
- Operational summary: active shipments, open workflow blockers, overdue tasks, due-today tasks, active documents, cheques due soon.
- Daily summary: shipments/tasks/documents/cheques/audit events created today.

Safe fields for Hamyar:
- Counts, high-level status, operational summary, daily summary.

Fields requiring live verification:
- Current counts and operational status.

Fields that should not be stored in memory:
- Billing/payment details beyond safe subscription status summaries.
- Private notes, raw payment provider payloads, signup review notes.

Relations:
- organization -> shipments
- organization -> customers
- organization -> tasks
- organization -> documents
- organization -> cheques
- organization -> activity/audit logs

Source-of-truth tool/repository:
- `getOperationsSnapshot`
- `getActiveShipmentCountsByStatus`
- `getCompanyBrainSnapshot`
- `getRecentOrganizationActivity`

Missing capabilities/TODOs:
- Add explicit policy for which billing/accounting summaries Hamyar can answer.
- Add a product-level allowlist for organization analytics before exposing deeper counts.

## 2. Shipment

Fields currently available:
- Shipment code, status, priority, route/origin/destination, Shamsi date/year/sequence.
- Customer id/name/code through `shipments.customer_id` and `customers`.
- Shipment V2 profile sections: status text, current stage, commercial card id/display name, Malvani profile id/display name, goods rows.
- Kootaj/customs details: commercial card id, order registration, currency type/amount, bank tracking, container summary, bill of lading, cotage number, customs status.
- Public tracking status and customer-visible status events.
- Captain/Malvani data through `malvani_profiles` and `business_entity_contacts`.
- Documents, tasks, workflow instance, blockers, chat summaries, audit history.

Safe fields for Hamyar:
- Shipment code, status/current stage, customer display, route, goods summary, document count, task count, workflow step, open blocker count.

Fields requiring live verification:
- Customer phone/address.
- Captain phone, Malvani agent phone, commercial-card agent phone.
- Public tracking enablement and customer-visible documents.
- Current workflow/blocker status.
- Financial/accounting summaries.
- Kootaj/customs and container fields.

Fields that should not be stored in memory:
- Raw phone numbers.
- Internal notes, private chat content beyond very short live summaries.
- Raw document storage keys/object keys.
- Customer-private contact details.
- Full card numbers and sensitive commercial-card identifiers.

Relations:
- shipment -> customer
- shipment -> commercial_card
- shipment -> documents
- shipment -> tasks
- shipment -> cheques through customer
- shipment -> workflow
- shipment -> Malvani profile -> business contacts
- shipment -> public tracking events

Source-of-truth tool/repository:
- `getShipmentDetailContext`
- `getShipmentFullProfile`
- `getShipmentCaptainInfo`
- `getShipmentMalvaniAgentInfo`
- `getShipmentMalvaniProfile`
- `getShipmentDocuments`
- `getTasksByShipment`
- `getShipmentWorkflowStatus`
- `getShipmentWorkflowBlockers`
- `getShipmentKootajDetails`
- `resolveShipmentRef`
- `searchShipmentByCode`
- `src/server/repositories/shipments.js`
- `src/server/repositories/shipment-v2.js`
- `src/server/repositories/daily-status.js`

Missing capabilities/TODOs:
- Add first-class live answer support for vessel name and container numbers beyond registry planning.
- Add safe answer template for commercial-card agent phone after source tool returns normalized contacts.
- Decide whether shipment financial summary remains "not connected" or gets a scoped billing source.

## 3. Customer

Fields currently available:
- Customer code, company name, contact name, phone, email, address, referrer, notes, status.
- Multiple customer phone numbers through `customer_phone_numbers`.
- Related shipments, documents, cheques, open tasks/blockers, audit history, archive status.

Safe fields for Hamyar:
- Customer code, safe display name, status, active shipment list/count.
- Document/check/task counts and safe summaries.

Fields requiring live verification:
- Phone numbers, contact person, email, address.
- Cheques and customer financial context.
- Archive status.

Fields that should not be stored in memory:
- Phone numbers, email, address.
- Private notes.
- National/tax identifiers from legacy data.

Relations:
- customer -> shipments
- customer -> documents
- customer -> cheques
- customer -> tasks/open issues
- customer -> commercial cards by search/context

Source-of-truth tool/repository:
- `getCustomerDetailContext`
- `getCustomerProfile`
- `getCustomerContactInfo`
- `getCustomerShipments`
- `getCustomerDocumentsSummary`
- `getCustomerChequeSummary`
- `getCustomerOpenIssues`
- `resolveCustomerRef`
- `searchCustomerByCode`
- `src/server/repositories/customers.js`

Missing capabilities/TODOs:
- Add explicit preferred-contact-person field to UI/data if the product needs more than `contact_name` and primary phone.
- Add stricter contact-answer permission checks if non-CEO Hamyar access is introduced later.

## 4. Commercial Card

Fields currently available:
- Stored in `user_records` collection `commercialCards`.
- Display name, holder name, company name, responsible name/phone, card number, national id, status, description.
- Contacts through `business_entity_contacts` with `entity_type = commercial_card`.

Safe fields for Hamyar:
- Display name, holder/company label, status, masked card number.

Fields requiring live verification:
- Responsible phone/agent number.
- Full card number or sensitive identifiers.

Fields that should not be stored in memory:
- Full card number when it has enough digits to be sensitive.
- National id and sensitive registration identifiers.
- Responsible phone.

Relations:
- commercial_card -> contacts
- shipment -> commercial_card
- customer -> commercial_card by search/context

Source-of-truth tool/repository:
- `getCommercialCardContext`
- `searchCommercialCards`
- `getBusinessEntityContacts`
- `src/server/repositories/business-entities.js`
- `user_records` collection `commercialCards`

Missing capabilities/TODOs:
- Move commercial cards from JSON `user_records` into a dedicated tenant-scoped table if more reporting/constraints are needed.
- Add a normalized `agent_number` field only with migration and privacy policy review.

## 5. Task

Fields currently available:
- Title, description, status, priority, assigned_to_id/name, assigned_by_id/name, due_at, source type/id.
- Shipment/customer/workflow/blocker links.
- Task events for assignment/status changes.

Safe fields for Hamyar:
- Title, status, priority, assignee display name, due date, related shipment/customer codes.

Fields requiring live verification:
- Today/overdue task lists.
- Assignee and workload.

Fields that should not be stored in memory:
- Internal assignment notes if sensitive.
- Full task event notes unless summarized safely.

Relations:
- task -> shipment
- task -> customer
- task -> workflow instance/step/blocker
- task -> assignee user

Source-of-truth tool/repository:
- `getTasksDueToday`
- `getMyActiveTasks`
- `getOrganizationActiveTasks`
- `getTasksByShipment`
- `getTasksByCustomer`
- `getTaskBasicInfo`
- `src/server/schemas/workflows.schemas.js`

Missing capabilities/TODOs:
- Add clearer task intent split between "my tasks", "organization tasks", and "shipment/customer tasks".

## 6. Document

Fields currently available:
- Title, file name, mime/content type, storage metadata, version, uploader, shipment/customer/meeting/cheque/quotation links.
- Visibility (`internal` or `customer_visible`), archive state, document versions.

Safe fields for Hamyar:
- Title/file name, document type, visibility, related shipment/customer code, upload/update date.

Fields requiring live verification:
- Customer-visible status.
- Completeness/missing required document state.
- Any download/open action.

Fields that should not be stored in memory:
- Storage keys, local paths, object keys, bucket/region, checksums.
- Document content unless an explicit safe extraction pipeline is added.

Relations:
- document -> shipment
- document -> customer
- document -> cheque
- document -> meeting
- document -> quotation

Source-of-truth tool/repository:
- `getShipmentDocuments`
- `getCustomerDocumentsSummary`
- `getCustomerVisibleDocuments`
- `getDocumentBasicInfo`
- `searchDocuments`
- `src/server/repositories/documents.js`

Missing capabilities/TODOs:
- Add first-class document required/missing policy instead of the current `unknownRequiredDocuments` fallback.
- Add document status answer template for storage migration status if needed.

## 7. Cheque

Fields currently available:
- Bank name, cheque number, amount, currency, due date, location, receiver, status, description, assigned user, customer link.

Safe fields for Hamyar:
- Cheque number, bank, due date, status, amount with currency when user is authorized.

Fields requiring live verification:
- Current due/overdue status.
- Customer cheque summary.
- Amount and currency.

Fields that should not be stored in memory:
- Full financial descriptions if sensitive.
- Anything beyond safe summary unless scoped and live verified.

Relations:
- cheque -> customer
- cheque -> document
- cheque -> assigned user

Source-of-truth tool/repository:
- `getChequesDueSoon`
- `getOverdueCheques`
- `getCustomerChequeSummary`
- `getChequeBasicInfo`
- `src/server/repositories/cheques.js`

Missing capabilities/TODOs:
- Add shipment relation if cheque-to-shipment becomes direct instead of customer-derived.

## 8. Workflow

Fields currently available:
- Workflow instances with status, current step, customs route, template snapshot.
- Step states, blockers, workflow events.
- Workflow templates, phases, step catalog, task policies, expected documents.

Safe fields for Hamyar:
- Current step label/code, workflow status, open blockers, public/internal blocker labels where allowed.

Fields requiring live verification:
- Latest step and blocker state.
- Step labels from workflow definition snapshots.

Fields that should not be stored in memory:
- Internal notes, private blocker notes, metadata with sensitive content.

Relations:
- workflow -> shipment
- workflow -> tasks
- workflow -> blockers
- workflow -> template/steps

Source-of-truth tool/repository:
- `getShipmentWorkflowStatus`
- `getShipmentWorkflowBlockers`
- `getWorkflowBlockerBasicInfo`
- `src/server/repositories/shipment-workflow-templates.js`
- `src/server/repositories/shipment-progress.js`

Missing capabilities/TODOs:
- Add workflow latest-step answer to registry-backed live answer path.

## 9. User / Staff

Fields currently available:
- User name, email, role, department, status, online state, phone/location/bio, organization membership.
- Task assignment/workload.

Safe fields for Hamyar:
- Name, role, department, active status, assigned task count.

Fields requiring live verification:
- Workload and task assignment.
- Phone/email if ever exposed.

Fields that should not be stored in memory:
- Password hashes, sessions, 2FA settings, notification preferences.
- Private phone/location/bio unless explicitly authorized.

Relations:
- user -> organization_members
- user -> tasks
- user -> audit logs

Source-of-truth tool/repository:
- `searchEmployees`
- `getEmployeeBasicInfo`
- `getEmployeeWorkload`
- `getActiveEmployeeCount`
- `src/server/repositories/users.js`

Missing capabilities/TODOs:
- Define staff privacy policy before allowing broad staff lookup outside CEO-only Hamyar.

## 10. Activity / Daily Summary

Fields currently available:
- Recent audit logs, company daily summary, operational snapshot, daily status/Kootaj summary.
- Recent organization activity and unread shipment chats.

Safe fields for Hamyar:
- Counts and short summaries.
- Recent activity labels where user is authorized.

Fields requiring live verification:
- Latest activity, today summaries, daily status counts, unread chats.

Fields that should not be stored in memory:
- Chat message bodies beyond short live summaries.
- Audit log details containing private data.

Relations:
- activity -> shipments
- activity -> tasks
- activity -> documents
- activity -> cheques
- activity -> audit logs

Source-of-truth tool/repository:
- `getDailyStatusSummary`
- `getRecentOrganizationActivity`
- `getCompanyBrainSnapshot`
- `getUnreadShipmentChats`

Missing capabilities/TODOs:
- Add alert/risk definitions before answering risk questions beyond existing blockers, overdue tasks, and due cheques.
