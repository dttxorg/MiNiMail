# Design System Notes

## Direction

MiNiMail uses a calm, focused desktop interface with a dark productivity surface, clear list density, and controlled accent color. The visual system should feel practical and modern rather than decorative.

## Principles

- Consistency over novelty: icons, spacing, and control shapes should feel like one system.
- Dense but readable: email lists need enough vertical efficiency for triage.
- Clear state: unread, selected, sending, failed, draft, attachment, and AI states should be visually distinct.
- Privacy-aware affordances: blocked remote images, attachment actions, and AI redaction should be understandable.

## Typography

Use system fonts only in the product implementation:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", Arial, sans-serif;
```

The design case study can show typographic hierarchy, but the shipped app should not depend on bundled third-party font files.

## Layout

- Left navigation: persistent mailbox and category access.
- Middle column: search, filters, grouped message list, compact sender/subject/snippet rows.
- Detail pane: original message, attachments, actions, and AI assistant.
- Compose dialog: form fields, AI tools, body editor, outgoing attachments, original-message reference, and send/draft controls.

## Components To Document

- Navigation item
- Smart category item
- Message row
- Empty state
- Message detail header
- Attachment card
- AI assistant card
- Compose recipient chips
- Draft selector
- Undo send toast
- Settings section

## Accessibility Notes

- Maintain readable contrast for text and controls.
- Avoid relying only on color for status.
- Preserve keyboard focus outlines.
- Keep click targets comfortable for toolbar and attachment actions.
- Validate localized labels in all supported languages.
