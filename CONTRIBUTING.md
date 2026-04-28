# Contributing to MiNiMail

MiNiMail is currently in early-preview / release-candidate development. Contributions should prioritize correctness, privacy, data safety, and regression coverage.

## Development Contributions

- Keep changes focused and avoid unrelated refactors in release-critical areas.
- Add or update regression tests for behavior changes.
- Run `npm run test:release` before proposing a release-facing change.
- Do not log email bodies, attachment contents, API keys, OAuth tokens, passwords, or other sensitive data.
- Preserve Electron security boundaries: renderer code should use preload IPC rather than direct filesystem or database access.

## Design Contributions

Design contributions are welcome through:

- Updates to [docs/design.md](docs/design.md).
- Safe screenshots under [docs/screenshots](docs/screenshots).
- Figma links or prototype links.
- UX audits, information architecture notes, and interaction-flow documentation.
- Pull requests from the independent design repository: `https://github.com/<designer-username>/minimail-design`.

Design-related pull requests should include:

- The user problem or product issue being addressed.
- The proposed solution and the reasoning behind it.
- Before/after screenshots, annotated screenshots, or a prototype link when relevant.
- Accessibility considerations such as contrast, keyboard flow, target size, and localization impact.
- Notes on whether the change affects existing workflows such as compose, drafts, attachments, AI assistance, or settings.

## Pull Request Checklist

- The change is scoped to the stated problem.
- User-facing text is localized or prepared for localization when appropriate.
- Sensitive information is not included in screenshots, fixtures, logs, or test output.
- Relevant tests or documentation have been updated.
- `npm run test:release` passes for release-critical changes.
