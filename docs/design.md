# MiNiMail Design Overview

This document gives a short design overview for the MiNiMail engineering repository. The complete UI/UX case study is maintained separately in the design repository:

`https://github.com/<designer-username>/minimail-design`

Design contributor: `<designer-name>`

## Scope

The engineering repository keeps concise design context so contributors can understand the product direction while working on implementation. Detailed portfolio material, visual exploration, iteration notes, and curated screenshots should live in the independent design repository.

## Design Principles

- Readability first: email content should remain the primary object, with controls and AI assistance supporting the reading flow rather than competing with it.
- AI as assistance, not replacement: summaries, action suggestions, quick replies, translation, and key information extraction should help the user decide faster while preserving access to the original email.
- Privacy-aware by default: sensitive email content should be redacted before cloud AI processing when privacy mode requires it; remote images and tracking pixels should not load automatically.
- Recoverable actions: compose, draft, undo send, attachment handling, and failed sends should preserve user work instead of silently losing state.
- Progressive disclosure: advanced routing diagnostics, smart folders, and AI details should stay available for calibration without overwhelming normal reading.
- Consistent density: the layout should show enough email context for triage while preserving clear touch targets and scannable hierarchy.

## Information Architecture

MiNiMail is organized around three persistent work areas:

- Navigation: accounts, mailbox folders, AI categories, GitHub smart folders, settings, and low-frequency folders such as trash and spam.
- Message list: search, list filters, grouped dates, sender identity, subject/snippet, unread state, attachment indicator, and smart category markers.
- Message detail: conversation context, sanitized email body, attachments, compose actions, AI assistance, translation, and key information extraction.

Settings are separated from daily reading and compose flows. AI provider configuration, privacy mode, cache ranges, account management, and backup controls belong in settings rather than the main triage surface.

## Key Interactions

### Compose

Compose should support fast writing while protecting user work. Recipient chips, subject, body, outgoing attachments, draft selection, AI polish/translation, and original-message references should update independently without resetting one another.

The send flow uses an undo window: the compose dialog closes immediately after a local scheduled send record is created, then the message is sent in the background after the undo period unless the user cancels.

### Drafts

Drafts should survive app restarts, failed sends, and interrupted scheduled sends. Deleting a draft should not close the entire draft list or revive stale draft records from cache or sync.

### Attachments

Received attachments are displayed as metadata first and downloaded only when the user asks. Attachment binary data should stay in the main process and should not be sent to the renderer. Forwarded messages can carry original ordinary attachments, while inline CID images and remote images are not treated as normal forwarded attachments by default.

### AI Assistance

AI assistance is organized around practical outcomes:

- Email summary: compact understanding of the message.
- Action suggestions: concrete next steps grounded in the email category and content.
- Quick replies: short reply drafts in the user's interface language.
- Key information extraction: names, dates, links, amounts, accounts, or task-like details when available.

The UI should make it clear when AI analysis is unavailable, failed, or based on limited content. AI output must not replace the original email body.

## Independent Design Repository

The full design case study should be published at:

`https://github.com/<designer-username>/minimail-design`

That repository should include the portfolio-oriented case study, design system notes, interaction flows, UX audit, Figma link, and curated screenshots. A copy-ready template is available in this repository under [design-repo-template](../design-repo-template).
