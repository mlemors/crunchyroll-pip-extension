# Crunchyroll PiP Extension — CLAUDE.md

## Project overview

A Manifest V3 Chrome extension that enhances Crunchyroll with two features:

1. **Picture-in-Picture (PiP)** — injects a PiP button into the video player and exposes a keyboard shortcut (Alt+Shift+P / Option+Shift+P on Mac)
2. **Dub Language Filter** — injects a language-chip bar into browse/search pages so users can filter anime by available audio language (e.g. German dub, English dub)

**Tech stack:** Vanilla ES6+, no bundler, no frameworks. Manifest V3, service worker background script, two content scripts.

**Browser support:** Chromium-based browsers only (Chrome, Brave, Edge, Vivaldi). Not Firefox or Safari.

---

## File map

```
manifest.json              Extension manifest (MV3)
background.js              Service worker — handles keyboard command + icon click → PiP
content.js                 Content script — PiP button injection into the video player
features/
  dub-filter.js            Content script — dub language filter bar for browse pages
scripts/
  build-release-zip.sh     Creates dist/crunchyroll-pip-extension-vX.Y.Z.zip
assets/
  preview.png              Screenshot used in README
```

---

## Dev setup

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the repo root (`crunchyroll-pip-extension/`)
4. After any code change: click the **refresh icon** on the extension card

> No build step required for development — just reload the extension.

---

## Build a release zip

```bash
bash scripts/build-release-zip.sh
# Output: dist/crunchyroll-pip-extension-vX.Y.Z.zip
```

The zip includes `manifest.json`, `background.js`, `content.js`, and `features/`.
It excludes `assets/`, `scripts/`, `CLAUDE.md`, `README.md`, `.git/`.

---

## Key patterns

### DOM injection
Both content scripts use `MutationObserver` on `document.documentElement` to wait for
target elements to appear in Crunchyroll's Next.js-rendered DOM before injecting UI.
Always guard with an `if (document.getElementById(MY_ID))` check to avoid double-injection.

### History hooks (SPA navigation)
`content.js` wraps `history.pushState` and `history.replaceState` to emit a custom
`cr-pip-route-change` event. Both content scripts listen to this event (plus `popstate`)
to handle Crunchyroll's client-side navigation.

### Fetch interception (`dub-filter.js`)
Installed at `document_start` (before any page JS runs). Wraps `window.fetch` to silently
inspect Crunchyroll's own `/content/v2/` API responses and extract audio locale metadata.
Always clones the response before reading it (`response.clone()`) so the page's own
consumption of the response is unaffected.

### Inline styles only
All injected UI uses inline styles. No external stylesheets, no CSS classes that could
collide with Crunchyroll's own class names. CSP-safe.

### Storage
- `chrome.storage.sync` — user preferences (future)
- `chrome.storage.local` — ephemeral session data (future)
- No storage permissions are currently declared in `manifest.json`; add `"storage"` to
  `permissions` when needed.

---

## Manifest permissions

| Permission | Why |
|------------|-----|
| `scripting` | `background.js` needs `chrome.scripting.executeScript` for the icon-click PiP trigger |
| `activeTab` | Scope `scripting` calls to the active tab |

Host permissions cover `https://www.crunchyroll.com/*` and `https://crunchyroll.com/*`.

---

## Adding a new feature

1. Create `features/my-feature.js` as a self-contained IIFE or module
2. Register it in `manifest.json` under `content_scripts`
3. Choose `run_at`:
   - `document_start` if you need to intercept fetch/XHR from the very first request
   - `document_idle` (default) for DOM-only injection
4. Use the `installHistoryHooks()` pattern from `content.js` (or listen to `cr-pip-route-change`)
   to handle SPA navigation — but only call the hook installer once (`window.__crXxxHooked`).
