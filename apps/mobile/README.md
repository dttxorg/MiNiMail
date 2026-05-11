# MiNiMail Mobile

This app is the React Native foundation for Android and iOS migration work.

## Current Status

- The app shell compiles against the cross-platform service contract in `@minimail/core`.
- Android native project files are present under `apps/mobile/android`.
- `npm run android --workspace @minimail/mobile` targets a connected device or running emulator and expects the Metro server to be started separately.
- Native implementations for IMAP, SMTP, OAuth, attachments, notifications, secure storage, and background scheduling are intentionally stubbed.
- The first mobile schema version mirrors the desktop account, settings, mail cache, and scheduled-send storage shape closely enough for future migration work.

## Android Demo

The current Android demo uses local mock inbox data. It demonstrates the first mobile screen shape:

- inbox triage with selected message state
- message detail with AI summary placement
- compose draft panel
- AI action area
- vector-memory LAN snapshot placeholder

Run checks:

```bash
npm run mobile:typecheck
npm run test:mobile-foundation
```

Run on Android after Java, Android SDK, `adb`, and an emulator/device are available:

```bash
npm run start --workspace @minimail/mobile
npm run android --workspace @minimail/mobile
```

Build a debug APK for device testing:

```bash
npm run android:apk --workspace @minimail/mobile
```

The debug APK will be written to:

```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

For standalone phone testing without Metro, build the release APK:

```bash
npm run android:apk:release --workspace @minimail/mobile
```

The release APK will be written to:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

## Vector Memory Strategy

Mobile should not abandon vector database powered AI, but it should not block the first mobile MVP on full desktop parity.

- Desktop should land the full local vector-memory implementation first, where local storage, background indexing, and resource usage are easier to control.
- Mobile should keep the same `VectorMemoryService` contract from the beginning.
- Mobile MVP may return empty semantic-search results until a native vector store, lightweight on-device index, or privacy-preserving sync strategy is chosen.
- User-visible AI features must degrade gracefully when vector memory is unavailable.
- The preferred parity path is LAN sync from desktop to mobile: desktop builds embeddings and vector indexes, then mobile imports encrypted snapshots or incremental deltas.
- Synced vector snapshots must include embedding model, dimension count, chunking version, checksum, source device, and encryption metadata so mobile never queries an incompatible index.
- Mobile should avoid re-indexing an entire mailbox unless the user explicitly opts into on-device indexing.

## Next Implementation Slices

1. Replace placeholder services with secure settings and account storage backed by Keychain/Keystore plus mobile SQLite.
2. Prove one real mail transport path on Android and iOS before building broader UI.
3. Add an inbox-first navigation shell and wire it to mock data matching the `MailService` contract.
4. Add desktop-to-mobile LAN pairing and encrypted vector snapshot import/export contracts before choosing a concrete vector store.
