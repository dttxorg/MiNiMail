# Interaction Flows

## Inbox Triage

1. User opens MiNiMail.
2. The message list shows recent cached emails while background sync continues.
3. User filters by all, unread, read, or attachments.
4. Smart folders and AI categories help narrow attention.
5. Selecting an email opens the detail pane without hiding the list.

## AI-Assisted Reading

1. User opens an email.
2. Original message remains visible.
3. AI assistant provides summary, action suggestions, quick replies, and key information when available.
4. If AI fails, the email remains usable.
5. Privacy redaction and remote image blocking stay independent of AI output.

## Compose And Drafts

1. User opens compose.
2. Recipients, subject, body, and attachments update independently.
3. Drafts are saved locally and can survive restarts.
4. Deleting a draft clears the current draft state without closing the compose surface unexpectedly.
5. Sending creates a scheduled send record and closes compose immediately.

## Undo Send

1. User clicks Send.
2. MiNiMail creates a local scheduled send record.
3. A non-blocking undo toast appears for five seconds.
4. If user clicks Undo, SMTP is not called and the content returns to draft/editable state.
5. If not undone, the message enters sending state and is sent in the background.
6. Success updates the local sent record; failure keeps the content recoverable.

## Attachments

1. Received attachments are shown as metadata.
2. User explicitly downloads or opens an attachment.
3. Attachment content stays in the main process and is not sent to the renderer.
4. Forwarding includes ordinary original attachments by default.
5. Replies do not include original attachments by default.

## Privacy-Aware Rendering

1. HTML email is sanitized before rendering.
2. Remote images and tracking pixels are blocked by default.
3. User can choose to show remote images for a specific email.
4. External links open in the system browser.
