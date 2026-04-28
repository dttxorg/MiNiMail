<p align="center">
  <img src="assets/brand/logo.png" alt="MiNiMail logo" width="128">
</p>

<h1 align="center">MiNiMail</h1>

<p align="center">
  An AI-native desktop email client for reading, understanding, and acting on everyday email.
</p>

[简体中文](../README.md) | English | [日本語](README.ja.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [Português](README.pt.md)

MiNiMail is an AI-native desktop email client designed to make everyday email easier to read, understand, and act on.

It combines a local-first mail cache with privacy-aware AI features for summarizing long messages, extracting key information, drafting replies, translating content, and routing different kinds of email.

> Current status: MiNiMail is in release candidate stage. It is suitable for testing, demos, and early feedback, but it is not recommended for critical production email workflows yet.

## Preview

![MiNiMail main window](assets/screenshots/main-window.png)

![MiNiMail AI Assistant](assets/screenshots/ai-assistant.png)

![MiNiMail key information](assets/screenshots/key-information.png)

![MiNiMail email auto configuration](assets/screenshots/auto-config.png)

## Demo Video

![MiNiMail demo video cover](assets/screenshots/demo-cover.png)

- YouTube: To be added
- Bilibili: https://www.bilibili.com/video/BV1Q89kBuEL9/

## Support

- Star this repository.
- Open issues.
- Share feedback.
- Join testing.

## Core Highlights

- Local-first caching for mail lists, message bodies, and attachment metadata.
- AI summaries, reply suggestions, translation, routing, and structured key information extraction.
- Generic AI categories plus dedicated routing for GitHub notification emails.
- Supports OpenAI-compatible APIs and local large language models, allowing users to choose between cloud and local models.
- Blocks remote images and tracking pixels by default.
- Sanitizes HTML email before rendering.
- Supports compose, drafts, attachments, sent-mail recovery, and 5-second undo send.
- Supports multilingual UI and README documentation.

## Privacy Model

MiNiMail is designed around user control.

- Supports OpenAI-compatible APIs and local large language models, allowing users to choose between cloud and local models.
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

完整 UI/UX case study 将由设计贡献者后续通过独立 PR 补充。

## License

This project is licensed under the [Apache License 2.0](../LICENSE).

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for engineering and design contribution guidelines.
