# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal MVP that turns a phone into a wireless touchpad/keyboard for a Windows PC over local Wi-Fi. Pnpm monorepo with four workspace packages: an Electron desktop app (server + tray/management GUI), a React/Vite mobile PWA (touchpad UI), a shared protocol package, and a native Windows input addon.

## Commands

Run from repo root unless noted. Package manager is pnpm (`packageManager: pnpm@9.12.0`).

```bash
pnpm install                # install all workspace deps
pnpm dev:desktop             # electron-vite dev — runs the desktop server + Electron GUI
pnpm dev:mobile              # vite dev --host — mobile PWA, reachable from phone on same LAN
pnpm dev                     # both dev servers together
pnpm build                   # pnpm -r build — build every workspace package
pnpm check                   # pnpm -r check — typecheck every workspace package (no test suite exists)
pnpm dist                    # build mobile, then electron-builder dist for desktop (produces installer)
```

Per-package typecheck (each package's `check` script is just `tsc --noEmit`/`tsc -b`, run individually when iterating on one package):
```bash
pnpm --filter @window-controller/desktop check
pnpm --filter @window-controller/mobile check
pnpm --filter @window-controller/protocol check
```

There is no test runner configured anywhere in the repo — verification is via typecheck (`pnpm check`) and manually exercising the app.

`start.bat` is a convenience launcher that opens both dev servers in separate terminal windows (Windows only).

### Native addon (`native/input-controller`)

```bash
cd native/input-controller
pnpm install     # runs scripts/install.js, which no-ops on non-Windows
pnpm build       # node-gyp rebuild — only meaningful on Windows
```

The addon only builds/runs on Windows (`win32`); `scripts/install.js` and `input-driver.ts` both skip/fallback on other platforms. Windows API calls in `src/input_controller.cc` are guarded by `#ifdef _WIN32`, so the C++ still compiles (as no-ops) elsewhere.

## Architecture

**Message flow:** mobile PWA → WebSocket (`/ws`) → Electron main-process server → native addon (or mock driver) → Windows `SendInput`.

- **`packages/protocol/src/index.ts`** — the single source of truth for the WebSocket wire protocol: `ClientMessage`/`ServerMessage` discriminated unions and the `isClientMessage` runtime type guard. Both `apps/desktop` and `apps/mobile` import this via the `@window-controller/protocol` workspace package (aliased directly to `src/index.ts` in `electron.vite.config.ts` for the desktop app, built to `dist/` normally). Changing the protocol means updating this package first, then both consumers.

- **`apps/desktop/src/main/server.ts`** — `startServer()` boots an Express + `ws` server (default port 4580, env-overridable via `PORT`/`HOST`). Handles pairing (6-digit code → `deviceId`/`token` persisted via `storage.ts`), token auth for reconnects, and dispatches authenticated messages to the input driver. Rejects WebSocket connections from non-private IP ranges (`isPrivateAddress`) as a LAN-only guard. Exposes a `ServerController` with a `stateChange` event so the Electron GUI can reactively show pairing code / connected device.

- **`apps/desktop/src/main/input-driver.ts`** — `loadInputDriver()` loads the compiled `input_controller.node` addon on Windows (trying `addonPath` first, then a dev-relative path into `native/input-controller/build/Release/`), falling back to a `console.log`-only mock driver on any load failure or non-Windows platform. This is the layer to touch when adding new input actions — extend `NativeDriver`, the C++ addon, and the mock together.

- **`apps/desktop/src/main/storage.ts`** — flat-file JSON persistence (`paired-devices.json` in the Electron `userData` dir) for paired device tokens. No database.

- **`apps/desktop/src/main/index.ts`** — Electron main process: creates the tray icon/menu (shows pair code + connected device), the management `BrowserWindow` (hidden on close instead of quitting — app lives in the tray), and wires `startServer()`'s state changes to both the tray menu and the renderer via IPC (`state-update`). `preload/index.ts` exposes a minimal `window.api` (`getState`, `onStateUpdate`, `openBrowser`) with `contextIsolation: true`/`nodeIntegration: false`.

- **`apps/desktop/src/renderer`** — the Electron management GUI (React), separate from the mobile touchpad UI. Talks to the main process only through the `window.api` preload bridge, never Node/Electron APIs directly.

- **`apps/mobile/src/App.tsx`** — single-file React app driving the whole client flow (`setup` → `pairing` → `ready` views) over one WebSocket connection. Persists session (`deviceId`/`token`) and last-used server host/port in `localStorage` so reconnect skips re-pairing. Mouse movement is coalesced and rate-limited to `SEND_INTERVAL` (~60Hz) via `movementRef` before sending `mouse_move` messages — follow this pattern for any other high-frequency input to avoid flooding the socket.

- **Packaging** (`apps/desktop/electron-builder.yml`): the mobile PWA build (`apps/mobile/dist`) and the native addon (`.node` binary) are bundled as `extraResources` into the installer, and `index.ts`/`input-driver.ts` resolve their paths differently depending on `app.isPackaged`.

## Adding a new remote-control action end-to-end

Touch, in order: `packages/protocol/src/index.ts` (message type) → `native/input-controller/src/input_controller.cc` (Win32 implementation) → `apps/desktop/src/main/input-driver.ts` (`NativeDriver` interface + mock) → `apps/desktop/src/main/server.ts` (dispatch case in the `switch`) → `apps/mobile/src/App.tsx` (UI to send it).
