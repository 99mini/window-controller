# Window Controller MVP

Monorepo for a personal MVP that lets a phone control a Windows PC over the same Wi-Fi.

## Packages

- `apps/desktop`: Node.js + TypeScript local server for Windows.
- `apps/mobile`: React + Vite PWA touchpad UI.
- `packages/protocol`: Shared protocol types and validation helpers.
- `native/input-controller`: C++ Node addon skeleton that calls Windows `SendInput`.

## MVP scope

- mouse move
- left click
- right click
- scroll
- 6-digit pairing code
- token-based session auth

## Local development

```bash
pnpm install
pnpm dev:mobile
pnpm dev:desktop
```

`apps/desktop` falls back to a mock input driver on non-Windows hosts. Build and run the native addon on Windows for real input injection.

## Windows native build

```bash
cd native/input-controller
pnpm install
pnpm build
```

The desktop server will automatically load `native/input-controller/build/Release/input_controller.node` on Windows.
