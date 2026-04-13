# 2026-04-13 Backup, Branding, and Sync Design

## Summary

This spec defines the next release-facing polish pass for MiniMail:

1. Replace the current top-left app branding with the new user-provided MinNiMail logo.
2. Add a first-release backup flow with EML export and EML import.
3. Separate "AI lookback" from "mail fetch history range" and expand fetch interval controls.
4. Add a dedicated unread conversations view and make unread state more visible.
5. Fix the duplicated clear/close actions in the search box.

This spec intentionally does **not** include MBOX/PDF export, ZIP/encryption, scheduled backups, or AI-generated backup manifests. Those are deferred until after the first backup release is stable.

## Goals

- Make the app feel ready for public release by replacing placeholder branding.
- Ship a practical, low-risk backup/import workflow that works with common email tools.
- Reduce confusion between AI analysis settings and actual mail sync settings.
- Improve discoverability of unread conversations.
- Eliminate a small but visible search UI bug.

## Non-Goals

- No MBOX export or import in this iteration.
- No PDF or HTML export in this iteration.
- No scheduled/automatic backups in this iteration.
- No ZIP packaging or encrypted backup archives in this iteration.
- No cross-device/cloud backup.
- No backend service or external storage integration.

## Product Decisions

### Branding

- The top-left sidebar header will remove the current blue square icon and the `minimail` text label.
- The new provided MinNiMail artwork will become the visual brand source.
- Small-size app surfaces will use the shield-envelope mark only, without the "MinNiMail" text.
- The same icon family will be used for:
  - sidebar app mark
  - BrowserWindow icon/titlebar branding where supported
  - installer/app icon assets in Electron Builder
  - About/settings branding block if shown

### Mail Backup and Import

- Backup UI will live inside Settings as a new `Backup` navigation section.
- First release supports:
  - EML export
  - EML import
  - account-level export
  - one or more folder selections
  - read/unread filtering
  - date-range filtering
  - progress display
  - cancel button
  - completion summary
  - "Open Folder" action after export
- Export preserves:
  - RFC 822 headers
  - original date
  - attachments
  - folder hierarchy
- Import supports:
  - one `.eml` file
  - multiple `.eml` files
  - one directory containing `.eml` files
  - choosing a target account
  - choosing a target IMAP folder

### Mail Fetch History Range

- A new setting will control **historical mail fetch range**.
- Allowed values:
  - `7 days`
  - `15 days`
  - `1 month`
  - `6 months`
  - `1 year`
  - `All`
- This setting applies only when:
  - a folder/account has no useful local cache yet
  - the app is filling historical cache
  - the user explicitly requests a history refill in the future
- This setting does **not** trim locally cached mail and does **not** block future incremental sync.
- After history is established, refresh and auto-fetch continue to pull only incremental new mail.

### Auto Fetch Interval

- Expand the interval choices to:
  - `Never`
  - `1 minute`
  - `5 minutes`
  - `10 minutes`
  - `15 minutes`
  - `30 minutes`
  - `60 minutes`
- `Never` means background polling is disabled; manual refresh remains available.

### Unread View

- Add a dedicated `Unread` section in the sidebar.
- The unread view filters the unified conversation list to only conversations containing unread mail.
- Existing unread counters remain, but conversation rows should also have a stronger unread visual treatment.

### Search UI

- The search input will render exactly one clear action when it contains text.
- The duplicate close/clear control will be removed.

## UX Design

## Sidebar

- Header:
  - replace current app header block with the new compact logo mark
  - no extra product text in the sidebar header
- Navigation order:
  - Conversations
  - Unread
  - Trash
  - Spam
  - Starred
  - Archive
  - AI Categories
  - Settings
- Unread count remains visible where relevant.

## Settings

- Keep the existing modal shell, but add a new `Backup` nav item.
- Left nav widths and row heights remain fixed so page switching does not visibly jump.
- `Accounts` section contains:
  - interface language
  - mail auto-fetch interval
  - mail fetch history range
  - connected account management
- `AI` section keeps AI-only settings:
  - API config
  - auto-categorize
  - scan depth
  - AI lookback range
- `Backup` section contains:
  - export scope selection
  - folder selector
  - read/unread filter
  - date range controls
  - export destination picker
  - import source picker
  - target account/folder picker
  - progress bar
  - cancel button
  - result summary
- `About` section remains, but branding uses the new icon family.

## Backup Flow

### Export Wizard-in-Panel

The backup page will behave like a guided form rather than a separate modal wizard:

1. Select account
2. Select scope
   - selected folders
   - full account
3. Select filters
   - read state
   - start date
   - end date
4. Select destination folder
5. Start export
6. Show progress and allow cancel
7. Show completion summary and "Open Folder"

### Export Output Layout

- Root export folder is user-selected.
- Inside that folder, export creates:
  - one directory per account when exporting whole account
  - one directory per selected folder
  - one `.eml` file per mail
- Suggested file naming:
  - `YYYY-MM-DD_HH-mm-ss__subject__uid.eml`
- File names must be sanitized for Windows path safety.

### Import Flow

1. Select source:
   - file(s)
   - directory
2. Scan `.eml` candidates
3. Select target account
4. Select target folder
5. Start import
6. Show progress and allow cancel
7. Show imported/skipped/failed counts

## Architecture

### Renderer

New/updated renderer responsibilities:

- `Sidebar.tsx`
  - replace top-left branding
  - add unread nav item
- `SettingsModal.tsx`
  - add `Backup` section
  - add `mail fetch history range` control
  - extend interval options
- `MailList.tsx`
  - stronger unread row treatment
  - search clear control fix
- `App.tsx`
  - pass unread view state into list filtering
  - load/save new settings
  - host backup task state for progress UI

### Main Process

New main-process responsibilities:

- New mail backup service module, likely `src/main/services/mailBackup.ts`
- New IPC registration in `src/main/ipc/mail.ts` or a dedicated `backup.ts`
- New file helper IPCs for:
  - pick export directory
  - pick import file(s)/directory
  - open exported folder
- Sync service update so history-range logic applies only to initial history loads, not incremental refresh

### Shared Data Model

Introduce typed request/response payloads for backup operations:

- `MailExportRequest`
- `MailExportProgress`
- `MailExportResult`
- `MailImportRequest`
- `MailImportProgress`
- `MailImportResult`

These can live in `src/shared/` to keep renderer and main aligned.

## Data Flow

### EML Export

1. Renderer submits export request.
2. Main process resolves selected account and folders.
3. Main process obtains candidate mail list from cache for selected folders.
4. Main process filters by:
   - read/unread
   - date range
5. For each selected message:
   - use cached body if available
   - fetch full detail only when body/headers are insufficient
   - build RFC 822 source
   - write `.eml` to destination subfolder
6. Main emits progress events.
7. Renderer updates progress UI.
8. On cancel:
   - task stops between messages
   - partial output remains
   - result summary reports partial completion

### EML Import

1. Renderer submits import request.
2. Main process enumerates selected `.eml` files.
3. Main parses each file using existing `mailparser` dependency.
4. Main uploads/imports mail into selected IMAP target folder.
5. Main also writes imported mail into local cache so the conversation list updates immediately.
6. Main emits progress events and a final summary.

### History Range Sync

1. Renderer loads `mail_fetch_history_range`.
2. On initial folder/account hydration:
   - if local cache exists, use cache then incremental sync
   - if local cache is empty or below minimum warm-state threshold, request history-limited sync
3. On later refresh/auto-fetch:
   - skip history window logic
   - fetch incremental new mail only

## Error Handling

### Export

- Destination selection canceled: no task starts.
- One mail export failure should not abort the entire export unless it indicates a fatal folder/path problem.
- Result summary must distinguish:
  - exported
  - skipped
  - failed
  - canceled

### Import

- Invalid `.eml` file should be counted as failed and included in summary.
- Per-file import failures should not abort the whole batch.
- If target folder is missing or unauthorized, fail early before processing all files.

### Sync Range

- Invalid settings values must fall back to a safe default of `1 month`.
- If range-based initial sync fails, the app should still show cached mail if available.

### Search

- Clearing the search query must restore the previous conversation list without requiring a second action.

## Testing Strategy

### Automated

- Export filter tests
  - read-only filter
  - unread-only filter
  - date window inclusion/exclusion
- Export file layout tests
  - account folders created correctly
  - sanitized file names
- Import parsing tests
  - valid `.eml`
  - invalid `.eml`
  - attachment-preserving path
- Sync history tests
  - empty cache uses configured history window
  - warm cache uses incremental sync only
  - later refresh ignores history window
- Unread view tests
  - only conversations with unread mail are shown
- Search UI regression
  - only one clear button when query exists

### Manual

- Verify new logo appears in sidebar and packaged app icon surfaces.
- Export a folder and open the output directory.
- Import exported `.eml` files into a target folder and confirm they appear in-app.
- Change history range and confirm first-time hydration behavior.
- Change auto-fetch interval to `Never` and `1 minute`.
- Verify unread conversations view works and is visually distinct.

## Release Notes Impact

The release will message these items as:

- New MinNiMail branding
- New unread conversation view
- New EML backup/import tools
- Configurable mail history range
- More precise auto-fetch intervals
- Search input polish

## Risks and Mitigations

### Risk: Export blocks UI on large accounts

Mitigation:
- Run work in main process task chunks
- emit progress often
- support cancel

### Risk: Imported mail duplicates existing server mail

Mitigation:
- first-release behavior will allow duplicates
- summary and docs will make this explicit
- deduplication is deferred

### Risk: Some cached mail lacks full body/header fidelity

Mitigation:
- export pipeline can fetch missing full detail lazily per message

### Risk: Icon source image is not ideal for multi-size app icons

Mitigation:
- derive one compact shield-envelope asset for app icon usage
- keep the full artwork only for large marketing surfaces if needed later

## Implementation Order

1. Shared config/types for history range and backup task payloads
2. Branding asset pipeline and sidebar/app icon replacement
3. Settings UI updates for history range and interval options
4. Unread view and search clear-button fix
5. EML export backend + renderer UI
6. EML import backend + renderer UI
7. Sync service history-range behavior
8. Tests and packaging verification

