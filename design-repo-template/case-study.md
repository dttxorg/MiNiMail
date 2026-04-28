# Case Study: MiNiMail

## Summary

MiNiMail is an early-preview AI-native desktop email client. The design challenge is to make email triage, compose, attachment handling, and AI assistance feel fast and trustworthy without hiding the original email or weakening privacy expectations.

## Problem

Email clients often become slow and cognitively heavy when users manage large inboxes, attachments, drafts, and multiple accounts. Adding AI can help, but it also introduces new concerns:

- Can users trust AI suggestions?
- Can they still inspect the original email?
- Are sensitive details protected before cloud processing?
- Does compose remain recoverable if sending fails?
- Are attachment and draft workflows predictable?

## Goals

- Help users triage emails faster without losing context.
- Make AI assistance visible, useful, and easy to ignore when not needed.
- Preserve original email readability and formatting where possible.
- Reduce risk in compose flows with draft persistence and undo send.
- Design attachment interactions that are explicit, safe, and recoverable.
- Support localization and privacy-aware workflows from the beginning.

## Constraints

- Desktop-first Electron application.
- Real email data can include hostile HTML, tracking pixels, large attachments, and broken MIME structures.
- AI output must not replace the original email.
- The product is in early preview / release candidate, so the design should support iteration rather than overclaim stability.

## Process

1. Mapped the core information architecture: navigation, message list, message detail, compose, settings, and AI assistance.
2. Identified high-risk workflows: drafts, undo send, attachments, OAuth reconnect, sent mail recovery, and remote image blocking.
3. Iterated on dense list layout and message detail readability.
4. Introduced AI assistance as a contained panel with summary, action suggestions, quick replies, and key information extraction.
5. Documented privacy-aware boundaries for remote images, redaction, and attachment handling.

## Key Design Decisions

- AI assistance is placed near the email body, but the original email remains visible and inspectable.
- Smart folders and AI categories support triage but should not replace normal mailbox navigation.
- Compose actions are recoverable: drafts persist, sending has an undo window, and failed sends keep content.
- Attachments use explicit download/open actions instead of automatic execution.
- Remote images are blocked by default to reduce tracking risk.

## Outcome

The current design supports an internal release-candidate build with core email reading, compose, attachment, smart routing, and AI-assistance workflows. Further validation is still needed with real users and larger mailbox datasets.

## Open Questions

- Which AI suggestions are consistently useful enough to show by default?
- How much diagnostic information should be visible to end users versus testers?
- What is the right balance between dense lists and reading comfort?
- How should advanced privacy controls be introduced without overwhelming users?
