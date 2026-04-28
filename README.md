# MiNiMail

MiNiMail is an early-preview AI-native desktop email client for Windows, built with Electron, TypeScript, and a local-first cache architecture.

The project focuses on:
- Fast email reading with local metadata/body caching.
- Privacy-aware AI assistance for summaries, replies, translation, routing, and structured extraction.
- Smart routing for generic priority categories and dedicated GitHub email workflows.
- Safer email rendering, including remote-image blocking and sanitized HTML display.
- Practical compose workflows, including drafts, attachments, sent-mail recovery, and undo send.

MiNiMail is currently in release-candidate testing. Some integrations and edge cases may still change before a stable release.

## Release Checks

Before creating a release build or internal test package, run:

```bash
npm run test:release
```

This release gate runs the production build and the key regression tests for secure AI key storage, remote image blocking, draft/cache handling, body rendering, compose flows, attachment handling, notifications, Electron sandbox behavior, and related release-critical paths.

If `test:release` fails, do not skip the failing check. First decide whether the failure is a real regression or an outdated assertion, then apply the smallest safe fix.

## Design / Credits

MiNiMail includes UI/UX design work that is documented as a separate design case study.

The engineering repository keeps the application source code, release notes, implementation documentation, and a short design overview. The full UI/UX case study is intended to live in an independent design repository:

`https://github.com/<designer-username>/minimail-design`

Design contributor: `<designer-name>`

See [docs/design.md](docs/design.md) for the design overview maintained in this repository.

## Screenshots

Screenshots for engineering documentation can be placed under [docs/screenshots](docs/screenshots). Keep screenshots free of personal email addresses, API keys, OAuth tokens, private attachments, and other sensitive information.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for engineering and design contribution guidelines.
