# MiNiMail

[简体中文](../README.md) | English | [日本語](README.ja.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [Português](README.pt.md)

MiNiMail is an AI-native desktop email client designed to make everyday email easier to read, understand, and act on.

It combines a local-first mail cache with privacy-aware AI features for summarizing long messages, extracting key information, drafting replies, translating content, and routing different kinds of email.

> Current status: MiNiMail is in release candidate stage. It is suitable for testing, demos, and early feedback, but it is not recommended for critical production email workflows yet.

## Core Highlights

- Local-first caching for mail lists, message bodies, and attachment metadata.
- AI summaries, reply suggestions, translation, routing, and structured key information extraction.
- Generic AI categories plus dedicated routing for GitHub notification emails.
- Uses the user's own AI API key and does not resell AI tokens.
- Blocks remote images and tracking pixels by default.
- Sanitizes HTML email before rendering.
- Supports compose, drafts, attachments, sent-mail recovery, and 5-second undo send.
- Supports multilingual UI and README documentation.

## Privacy Model

MiNiMail is designed around user control.

- Users provide their own AI API key.
- MiNiMail does not resell AI tokens.
- Email processing is privacy-aware by default.
- Remote images and tracking pixels are blocked by default.
- HTML email is sanitized before rendering.

## Current Platform

MiNiMail currently focuses on the Windows desktop app.

The stack includes:

- Electron
- TypeScript
- Local-first email caching
- IMAP / SMTP / OAuth account flows

## Roadmap

MiNiMail is currently focused on improving the Windows desktop experience. After the architecture becomes more stable, the project plans to explore:

- macOS desktop support.
- Mobile experiences, including iOS, Android, and other possible platforms.
- More complete local privacy modes and AI mail knowledge features.
- A fuller design system, interaction documentation, and multilingual docs.

These directions will move forward based on stability, maintenance cost, and real user feedback. No release dates are promised.

## Before Release

Before creating a release or internal test build, run:

```bash
npm run test:release
```

If the check fails, do not skip failed items. First determine whether it is a real regression or an outdated assertion, then apply the smallest safe fix.

## Design

The full UI/UX case study will be added in a separate design repository.

Design contributor information will be added before public release.

This engineering repository keeps the source code, release documentation, and a short design overview. See [design.md](design.md) for more context.

## License

This project is licensed under the [Apache License 2.0](../LICENSE).

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for engineering and design contribution guidelines.
