# LeetCode Blind Review

LeetCode Blind Review is a local-only Chrome Manifest V3 extension for starting a guarded Blind Attempt on supported `leetcode.cn` Practice Problems without revealing previously saved code.

Ticket 03 delivers the first complete non-destructive slice. Blind Mode can be enabled from the toolbar popup, a new guarded Practice View receives an Editor Guard before page rendering, and the user gets a complete five-second window in which they can choose Attempt Bypass and keep the current draft.

This build deliberately has no production Reset executor. Pressing Enter, choosing “立即盲重置”, or allowing the countdown to finish transfers one Reset Authorization into a non-destructive intent and then enters Guarded Failure. It never clicks LeetCode Reset, crosses a Reset Commit Point, runs code, submits code, or writes Editor contents.

## Requirements

- Node.js 22.12 or later
- npm 10
- Google Chrome Stable

## Build and install

```text
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/extension`.

The release package contains:

- `background.js` for the recoverable Blind Mode transaction and runtime registration;
- `controller.js` and `guard.css` for the guarded Document lifecycle;
- `popup.html`, `popup.js`, and `popup.css` for the minimal toolbar control;
- `manifest.json` with the approved minimal permissions.

## Use this slice

1. Open the extension popup and choose **启用 Blind Mode**.
2. On a supported guarded Practice View, the full-viewport Editor Guard remains until one Coding Workspace is identified.
3. The Guard then narrows to the complete Coding Workspace while the problem description remains usable.
4. During the five-second window, choose **保留当前草稿** or press `Esc` to create a Bypassed Entry and restore normal page interaction.
5. Choose **关闭 Blind Mode** at any time to prevent new workflow, cancel the current generation, remove the Guard, unregister future Document activation, and clear session state.

The checked-in deterministic fixture uses the provisional semantic boundary `role="region"` plus `aria-label="Coding workspace"`. Ticket 02 still owns current logged-in `leetcode.cn` UI contract evidence and versioning. Until that evidence and the later Reset-adapter tickets are complete, this package must not be described as able to reset a real draft.

## Verification

```text
npm run test:lifecycle
npm run test:artifact
npm run test:blackbox
npm test
```

- `test:lifecycle` verifies the public event-to-state/command seam: enabling and rollback, guarded preflight, Workspace Guard acknowledgement, the exact five-second deadline, one-use Reset Authorization transfer, Attempt Bypass latching, Guarded Failure, and disable ordering.
- `test:artifact` builds and audits the actual release package. It fixes the manifest and file surface, forbids a production click executor, content getters, Editor write paths, custom network clients, remote assets, canaries, and test hooks.
- `test:blackbox` installs the same release package into Chrome Stable with a fresh temporary profile and a deterministic `leetcode.cn` fixture. It verifies the real popup, dynamic `document_start` registration, current-page activation, registration rollback, screencast frames, Guard geometry, focus isolation, button/Esc Bypass, DOM storms, controller neutralization, restart reconciliation, zero Reset events, and zero custom network requests.
- `npm test` runs typechecking, a clean production build, and the complete suite.

The black-box runner uses the standard Windows Chrome path by default. Set `CHROME_STABLE_PATH` when Chrome is installed elsewhere. It runs Headless by default; set `LBR_HEADED=1` to observe the isolated Chrome window.

## Security boundary

- Production runtime dependencies: none.
- Permissions: `storage`, `scripting`, and the exact `https://leetcode.cn/problems/*` host scope.
- Incognito: not allowed.
- Persistent state: only versioned, non-sensitive configuration in `chrome.storage.local`.
- Session state: cleared during rollback and disabling and never stores page contents.
- Content-Blind: the controller selects workflow metadata and semantic boundaries but never reads, copies, hashes, logs, or transmits Editor, Testcase, result, Console, or Submission contents.
- Local-only: no telemetry, remote configuration, custom fetch/XHR/WebSocket/Beacon/EventSource requests, or remote code.
- Non-destructive: no visible-Reset adapter or executor, no `.click()` automation, no private API, and no browser-draft or Editor write path.

Full route semantics, SPA/language generation changes, foreground activity budgeting, Attempt Ownership, Recovery Entry, a versioned real-site Reset contract, production Reset execution, diagnostics, and the complete accessibility/release matrices remain assigned to later tickets.
