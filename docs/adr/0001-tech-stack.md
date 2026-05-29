# 1. Technology stack

- Status: Accepted
- Date: 2026-05-30

## Context

Sociograph is a single-player desktop strategy and simulation game. It needs a
cross-platform desktop shell, a rich custom UI for the influence map and
dashboards, a strongly typed codebase for a non-trivial simulation, and small,
fast installers suitable for offline play.

## Decision

- **Shell:** Tauri 2.x. The UI runs in the operating system's native WebView and
  the native layer is Rust.
- **Frontend:** React 19 with TypeScript in `strict` mode, bundled by Vite.
- **Package manager:** pnpm, with Node 20 LTS pinned via `.nvmrc`.
- **Tests:** Vitest with React Testing Library.
- **Persistence:** the Tauri Store plugin (`@tauri-apps/plugin-store`) for JSON
  saves and settings.

Dependency versions are pinned to whatever the scaffolder emits; we do not chase
the latest releases without a concrete reason.

## Consequences

- **Smaller and lighter than Electron.** Tauri ships no browser engine, so
  installers are a few megabytes and idle memory use is low. Electron bundles
  Chromium, producing 100 MB+ installers and higher memory use.
- **Trade-off — WebView variance.** Rendering depends on the host WebView
  (WebView2 on Windows, WebKit on macOS and Linux), so we test on each platform
  and target conservative web features. Electron would instead provide one
  consistent engine everywhere.
- **Trade-off — younger ecosystem.** Tauri's plugin and example ecosystem is
  smaller than Electron's, and the native layer requires a Rust toolchain.
- The engine is plain TypeScript (see ADR 0002), so the game logic is independent
  of the shell and could be retargeted if that ever becomes necessary.
