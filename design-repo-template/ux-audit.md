# UX Audit

## Audit Scope

This audit template is for evaluating MiNiMail as an early-preview / release-candidate product. It should be updated with screenshots, test notes, and issue links as the product evolves.

## Areas To Review

### Triage

- Can users quickly understand what needs attention?
- Are smart folders useful without duplicating normal categories?
- Does the message list show enough emails per screen?

### Reading

- Does the email body preserve original readability?
- Are remote image states understandable?
- Are attachments visible without feeling risky?

### Compose

- Do recipients, subject, body, and attachments remain stable while editing?
- Are drafts recoverable after closing or restarting the app?
- Is undo send clear and trustworthy?

### AI Assistance

- Are summaries grounded in the email?
- Are action suggestions concrete rather than generic?
- Are quick replies varied and context-aware?
- Does the user always have access to the original email?

### Privacy And Safety

- Are redaction, blocked remote images, and attachment actions clear?
- Does the product avoid exposing sensitive information in logs or screenshots?
- Are external links and attachments handled by explicit user action?

## Known Risks To Track

- AI suggestions may feel inconsistent until calibrated with more real email samples.
- Complex HTML email rendering can vary across senders.
- Attachment and draft workflows need continued real-world testing.
- Multi-account OAuth and sent-folder behavior can vary by provider.

## Evidence To Add

- Annotated screenshots.
- Before/after interaction comparisons.
- User testing notes.
- Accessibility checks.
- Localization screenshots.
- Release-candidate test notes.
