# Exited Shipments Archive

## Purpose

`محموله‌های خروج‌شده` is a safe operational archive for shipments that have passed release/exit but still need long-term follow-up. Typical follow-up includes deposits, guarantees, final settlements, final documents, accounting review, and department follow-ups.

## Archive Vs Delete

This feature does not delete or copy shipments. The original shipment remains in `shipments` and keeps its documents, chat thread, workflow history, daily-status/import data, public tracking token state, and audit history.

The active operation marker is `shipments.exited_archived_at`. When it is set, the shipment is removed from active operational lists but remains available through `/shipments/exited`, global search, and its direct Shipment Detail URL.

## Post-Exit Follow-Up Fields

The additive shipment fields are:

- `exited_archived_at`
- `exited_archived_by_id`
- `exited_archive_reason`
- `post_exit_status`
- `post_exit_note`
- `post_exit_follow_up_at`
- `post_exit_closed_at`
- `post_exit_closed_by_id`

Supported `post_exit_status` values:

- `needs_follow_up` - نیاز به پیگیری
- `in_progress` - در حال پیگیری
- `settled` - تسویه شده
- `closed` - بسته شده

## Active Page Filtering

Exited archived shipments are excluded from normal active operations by default:

- `/shipments`
- `/daily-status`
- dashboard active/latest/priority shipment summaries
- customer active-shipment summaries

They are still available through:

- `/shipments/exited`
- global search with the `خروج‌شده` badge
- direct `/shipments/:id`

## Restore Behavior

Restore clears `exited_archived_at`, so the shipment appears again in active operation pages. Restore does not delete post-exit notes, reason fields, documents, chat, workflow state, or audit history.

## Permissions

The implementation reuses existing shipment permissions:

- `shipments.view_all`: view exited shipments and direct details
- `shipments.archive`: move to exited archive and restore
- `shipments.update`: update post-exit follow-up fields

All server APIs derive tenant scope from the authenticated session. Client-supplied tenant identifiers are not accepted by the strict request schemas.

## Audit

The following audit events are recorded:

- `shipment.exited_archive`
- `shipment.exited_restore`
- `shipment.post_exit_update`

Audit metadata includes safe operational context such as reason, whether notes/follow-up changed, and previous/new post-exit status. Secrets, storage keys, token hashes, and private object-storage metadata are not included.

## Public Tracking Safety

Public tracking behavior is unchanged and continues to use allowlisted DTOs only. Internal post-exit fields are not exposed publicly:

- `post_exit_note`
- internal post-exit status
- archive reason
- actor/user IDs
- audit data
- organization IDs
- internal chat/task/workflow-template details

## V2 Ideas

- Deposit tracking module
- Guarantee return checklist
- Accounting settlement workflow
- Reminders for post-exit follow-up
- Reports for unsettled exited shipments
