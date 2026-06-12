# Internal company chat

## Scope

Company chat supports three internal categories:

- Direct messages
- Internal groups
- Shipment chats

Shipment detail pages show the shipment chat panel above documents so operational discussion is visible before file handling. The compact shipment-detail panel is V1 text-only. Full attachment upload, preview, download, and deletion are available from the main `/chat` page.

## Attachments

Chat attachments are stored separately from official shipment documents in `chat_message_attachments`.

Allowed types:

- Images: JPG, PNG, WebP up to 5 MB
- Files: PDF, DOCX, XLSX, TXT, CSV up to 15 MB

Attachment previews and downloads always go through server routes:

- `GET /api/chat/messages/:messageId/attachments/:attachmentId/preview`
- `GET /api/chat/messages/:messageId/attachments/:attachmentId/download`

The frontend receives only allowlisted metadata and these backend URLs. Storage keys, buckets, object keys, and local paths are never exposed in chat DTOs.

## Access Control

Attachment upload, preview, download, and sender deletion require normal chat membership checks. Shipment chat access also uses the existing shipment access guard.

The CEO-only media library lives in `/documents` under "رسانه‌ها و فایل‌های گفتگو". It requires:

- `chat.media.view`
- `chat.media.delete` for deleting any chat media item

Only the CEO role is seeded with these permissions.

## Deletion

Deleting a chat attachment soft-deletes the attachment row, removes its storage object/file when possible, and writes audit/chat events. Deleted attachments remain visible as placeholders in chat history and as deleted records in the CEO media library. Official document records are not changed by chat attachment deletion.

## Public Tracking

Public tracking responses must not include chat messages, chat attachments, filenames from internal chat media, or any chat storage metadata. Public tracking continues to use allowlisted public DTO fields only.
