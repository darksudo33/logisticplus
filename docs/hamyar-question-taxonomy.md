# Hamyar Question Taxonomy

This taxonomy defines the main question groups Hamyar should understand. The registry is the machine-readable source; this document explains the workflow behavior for product and QA review.

## 1. Identity / Capability

Persian examples:
- تو کی هستی؟
- چه سوال‌هایی را جواب می‌دهی؟

Expected intent: `identity.capability`

Primary entity: organization/system

Relation path: none

Expected tool/memory source: none

Answer behavior:
- Answer directly.
- Do not search Company Brain.
- Do not call live tools.

Missing-data behavior:
- Not applicable.

## 2. Shipment Lookup

Persian examples:
- بار 14051102036 رو پیدا کن.
- پرونده سنجری رو بیار.

Expected intent: `shipment.lookup`

Primary entity: shipment

Relation path: `shipment`

Expected tool/memory source:
- Company Brain/search index for candidates.
- `resolveShipmentRef` or `getShipmentDetailContext` for live verification.

Answer behavior:
- If one shipment is found, return a short safe summary and set active shipment.
- If multiple matches are found, ask for selection.

Missing-data behavior:
- Ask for shipment code, exact customer name, or goods clue.

## 3. Shipment Status

Persian examples:
- وضعیت محموله 14051102036 چیه؟
- بار 1234021 کجاست؟

Expected intent: `shipment.status.lookup`

Primary entity: shipment

Relation path: `shipment -> status`

Expected tool/memory source:
- `getShipmentDetailContext`
- Company Brain only as candidate source.

Answer behavior:
- Return current status/current step from live context.

Missing-data behavior:
- Say status is not registered for this shipment.

## 4. Shipment Customer / Owner

Persian examples:
- مشتری بار 1234021 کیه؟
- بار X مال کیه؟

Expected intent: `shipment.customer.lookup`

Primary entity: shipment

Relation path: `shipment -> customer`

Expected tool/memory source:
- `getShipmentDetailContext`

Answer behavior:
- Return customer display name and customer code when available.
- Set active entity to the customer when the user asks about the owner.

Missing-data behavior:
- Say no customer is registered for this shipment.

## 5. Shipment Contact

Persian examples:
- شماره تماس مشتری بار 1234021 چنده؟
- تلفن صاحب این محموله رو بده.

Expected intent: `shipment.customer.phone.lookup`

Primary entity: shipment

Relation path: `shipment -> customer -> contact`

Expected tool/memory source:
- `getShipmentDetailContext`
- `getCustomerContactInfo`

Answer behavior:
- Live-verify customer phone.
- Do not answer from memory-only facts.

Missing-data behavior:
- Say no phone is registered for the customer of this shipment.

## 6. Shipment Agent / Captain / Vessel

Persian examples:
- شماره ایجنت محموله 14051102036 رو بده.
- شماره ناخدای محموله 14051102036 چنده؟
- نام لنج محموله 14051102036 چیه؟

Expected intents:
- `shipment.agent.phone.lookup`
- `shipment.captain.phone.lookup`
- `shipment.vessel.lookup`

Primary entity: shipment

Relation path:
- `shipment -> malvani -> contact`
- `shipment -> malvani -> captain`
- `shipment -> malvani -> vessel`

Expected tool/memory source:
- `getShipmentMalvaniAgentInfo`
- `getShipmentCaptainInfo`
- `getShipmentMalvaniProfile`

Answer behavior:
- Live-verify contact fields.
- Use memory only to identify candidate shipment/Malvani profile.

Missing-data behavior:
- Say the agent/captain/vessel field is not registered for this shipment.

## 7. Commercial Card

Persian examples:
- کارت بازرگانی محموله 14051102036 چیه؟
- شماره ایجنت کارت بازرگانی بار 1234021 رو بده.

Expected intents:
- `shipment.commercial_card.lookup`
- `shipment.commercial_card.agent.lookup`

Primary entity: shipment or commercial_card

Relation path:
- `shipment -> commercial_card`
- `shipment -> commercial_card -> contact`

Expected tool/memory source:
- `getShipmentDetailContext`
- `getCommercialCardContext`
- `getBusinessEntityContacts`

Answer behavior:
- Return safe card display/status or masked card number.
- Live-verify agent/responsible phone.

Missing-data behavior:
- Say no linked card or card contact is registered.

## 8. Customer Lookup

Persian examples:
- مشتری 214 رو پیدا کن.
- اطلاعات مشتری سنجری رو بده.

Expected intent: `customer.lookup`

Primary entity: customer

Relation path: `customer`

Expected tool/memory source:
- Company Brain/search index for candidates.
- `getCustomerDetailContext` for live context.

Answer behavior:
- Return customer summary and active customer.

Missing-data behavior:
- Ask for customer code or more exact name.

## 9. Customer Contact

Persian examples:
- شماره تماس مشتری 214 چنده؟
- تلفن آقای سنجری رو بده.

Expected intent: `customer.contact.lookup`

Primary entity: customer

Relation path: `customer -> contact`

Expected tool/memory source:
- `getCustomerContactInfo`

Answer behavior:
- Live-verify phone/contact person/address.
- Avoid memory-only contact answers.

Missing-data behavior:
- Say no visible phone/contact is registered.

## 10. Customer Shipments

Persian examples:
- بارهای مشتری 214 کدومن؟
- محموله‌های فعال سنجری رو بده.

Expected intent: `customer.shipments.lookup`

Primary entity: customer

Relation path: `customer -> shipments`

Expected tool/memory source:
- `getCustomerShipments`

Answer behavior:
- Return active shipment codes and current statuses.

Missing-data behavior:
- Say no active shipment is available for this customer.

## 11. Tasks

Persian examples:
- امروز چه وظایفی داریم؟
- تسک‌های امروز رو بده.
- مسئول این وظیفه کیه؟

Expected intents:
- `task.today.lookup`
- `task.assignee.lookup`

Primary entity: task

Relation path:
- `organization -> tasks`
- `task -> assignee`

Expected tool/memory source:
- `getTasksDueToday`
- `getTaskBasicInfo`
- `getTasksByShipment`
- `getTasksByCustomer`

Answer behavior:
- Return live task lists or assignee.

Missing-data behavior:
- Say no task/assignee/due date is registered.

## 12. Workflow

Persian examples:
- آخرین مرحله محموله 14051102036 چیه؟
- این بار در کدام مرحله است؟

Expected intent: `workflow.latest_step.lookup`

Primary entity: shipment

Relation path: `shipment -> workflow -> latest_step`

Expected tool/memory source:
- `getShipmentWorkflowStatus`
- `getShipmentWorkflowBlockers`

Answer behavior:
- Return current workflow step and blockers when requested.

Missing-data behavior:
- Say no active workflow/current step is registered.

## 13. Documents

Persian examples:
- اسناد محموله 14051102036 رو بده.
- مدارک این بار کامل است؟

Expected intent: `document.shipment.lookup`

Primary entity: shipment/document

Relation path: `shipment -> documents`

Expected tool/memory source:
- `getShipmentDocuments`
- `getMissingShipmentDocuments`
- `getCustomerVisibleDocuments`

Answer behavior:
- Return document list/count from live context.
- For customer-visible questions, use visibility fields.

Missing-data behavior:
- Say no document is registered, or required-document policy is not connected.

## 14. Cheques / Payments

Persian examples:
- چک‌های مشتری 214 رو بده.
- سررسید چک 991122 کیه؟

Expected intents:
- `cheque.customer.lookup`
- `cheque.due_date.lookup`

Primary entity: customer or cheque

Relation path:
- `customer -> cheques`
- `cheque -> due_date`

Expected tool/memory source:
- `getCustomerChequeSummary`
- `getChequeBasicInfo`
- `getChequesDueSoon`
- `getOverdueCheques`

Answer behavior:
- Return amount with explicit currency when amount is shown.
- Live-verify due/status.

Missing-data behavior:
- Say no cheque/due date is registered.

## 15. Activity / Daily Summary

Persian examples:
- امروز چه اتفاقی افتاده؟
- وضعیت کلی شرکت چیه؟

Expected intent: `company.daily_summary.lookup`

Primary entity: organization

Relation path: `organization -> activity`

Expected tool/memory source:
- `getCompanyBrainSnapshot`
- `getOperationsSnapshot`
- `getDailyStatusSummary`

Answer behavior:
- Snapshot summary is acceptable if marked with freshness.
- Prefer live tools for current counts.

Missing-data behavior:
- Say no snapshot/daily summary is available.

## 16. Counts / Analytics

Persian examples:
- چند محموله فعال داریم؟
- چند وظیفه عقب‌افتاده داریم؟

Expected intent:
- company/operations summary intent, with future count-specific intents.

Primary entity: organization

Relation path: `organization -> entity_count`

Expected tool/memory source:
- `getOperationsSnapshot`
- `getActiveShipmentCountsByStatus`

Answer behavior:
- Return live counts only.

Missing-data behavior:
- Say the count source is not connected.

## 17. Missing-Data Questions

Persian examples:
- کدوم محموله‌ها وضعیت روزانه ندارن؟
- مدارک کدام بار ناقصه؟

Expected intent: `missing_data.lookup`

Primary entity: organization/shipment

Relation path: `organization -> missing_data`

Expected tool/memory source:
- `getShipmentsMissingDailyUpdate`
- `getDocumentCompletenessSummary`
- `getMissingShipmentDocuments`

Answer behavior:
- Return live missing-data lists or explicitly say required-document rules are not connected.

Missing-data behavior:
- Say no matching missing-data case was found.

## 18. Risk / Alert Questions

Persian examples:
- چه بارهایی مانع باز دارند؟
- چه چک‌هایی نزدیک سررسید هستند؟

Expected intent:
- Existing operations/workflow/cheque live-tool intents; future risk-specific registry intents.

Primary entity: organization

Relation path:
- `organization -> workflow_blockers`
- `organization -> cheques_due`

Expected tool/memory source:
- `getBlockedShipments`
- `getChequesDueSoon`
- `getOverdueCheques`
- `getOverdueTasks`

Answer behavior:
- Return live alert lists.

Missing-data behavior:
- Say no open blockers/due cheques/overdue items were found.

## 19. Follow-Up Questions

Persian examples:
- شماره تماسش رو بده.
- وضعیتش چیه؟
- اسنادش کامل است؟

Expected intent:
- Same requested field as the follow-up phrase, scoped to `activeEntity`.

Primary entity:
- active shipment or active customer.

Relation path:
- Derived from active entity plus requested field.

Expected tool/memory source:
- Active entity live detail tool.

Answer behavior:
- Active entity has priority over fresh search when no new entity ref is present.

Missing-data behavior:
- If no active entity is available, ask for shipment/customer code.

## 20. Ambiguity / Selection Replies

Persian examples:
- گزینه دوم.
- به 214.

Expected intent: `ambiguity.selection.reply`

Primary entity:
- selected candidate from previous assistant ambiguity response.

Relation path: `selection`

Expected tool/memory source:
- Previous candidate list, then normal live tool for selected entity.

Answer behavior:
- Resolve by option number or exact code.
- Preserve previous requested field.

Missing-data behavior:
- Ask the user to send option number or exact code again.
