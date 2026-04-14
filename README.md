# Solitaire (Tauri + TypeScript)

Klondike solitaire (draw three, single pass) with a vanilla HTML/CSS/TypeScript frontend and a Tauri 2 desktop shell.

## Prerequisites

- [Node.js](https://nodejs.org/) (current LTS is fine)
- [Rust](https://www.rust-lang.org/) (for `cargo` / Tauri)
- On Windows: Visual Studio C++ build tools when compiling the Tauri backend

## Development

```bash
npm install
npm run dev
```

This runs the Vite dev server (port `1420` by default). In another terminal, or via the Tauri CLI, run `npm run tauri dev` to open the desktop window pointed at that dev server.

## Tests

```bash
npm run test          # Vitest — game logic (unit)
npm run test:e2e      # Playwright — web UI (builds, then serves `vite preview` on 127.0.0.1:4173)
```

First-time Playwright setup may require browser binaries: `npx playwright install chromium`.

## Build

**Web frontend only**

```bash
npm run build
```

Output is written to `dist/`, which Tauri consumes for release builds.

**Desktop installer (Windows x64)**

```bash
npm run tauri build
```

Installable artifacts are emitted under `src-tauri/target/release/bundle/` (for example `.msi` and NSIS `.exe` installers on Windows). The unpacked app binary is `src-tauri/target/release/solitaire.exe` (name may match `productName` in `src-tauri/tauri.conf.json`).

A small helper script that runs `tauri build` and prints bundle paths:

```bash
npm run build:exe
```

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
