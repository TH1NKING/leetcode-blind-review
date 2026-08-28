# LeetCode Blind Review

LeetCode Blind Review is a local-only Chrome Manifest V3 extension for starting a guarded Blind Attempt on supported `leetcode.cn` Practice Problems without revealing previously saved code.

Ticket 01 intentionally delivers only the installable, default-off foundation. It does not yet provide a toolbar control, Editor Guard, Blind Attempt activation, or Reset interaction. Loading this version cannot reset a draft.

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

The installed package contains only `manifest.json` and `background.js`. Blind Mode is stored as `off` on first installation. There is no page script or toolbar UI in Ticket 01.

## Verification

```text
npm run test:lifecycle
npm run test:artifact
npm run test:blackbox
npm test
```

- `test:lifecycle` verifies the public event-to-command seam: Blind Mode off remains Inert for Practice, Reference, and unsupported route observations.
- `test:artifact` builds and audits the actual `dist/extension` directory, including its exact permissions and absence of network or content-reading interfaces.
- `test:blackbox` installs that same directory into Google Chrome Stable with a fresh temporary profile and an externally controlled `leetcode.cn` fixture.
- `npm test` runs typechecking, a clean production build, and the complete suite.

The black-box runner uses the standard Windows Chrome path by default. Set `CHROME_STABLE_PATH` when Chrome is installed elsewhere. It runs Headless by default; set `LBR_HEADED=1` to observe the isolated Chrome window.

## Security boundary

- Production runtime dependencies: none.
- Permissions: `storage`, `scripting`, and the exact `https://leetcode.cn/problems/*` host scope.
- Incognito: not allowed.
- Persistent state: only versioned, non-sensitive configuration in `chrome.storage.local`.
- Session-only state: reserved for future Attempt, Ownership, and diagnostics metadata in `chrome.storage.session`.
- No telemetry, remote configuration, static content scripts, test hooks, or remotely hosted code.
