# Sociograph

Sociograph is a single-player desktop strategy and simulation game. You play an
operator who builds relationship capital on a private four-zone influence map and
turns it into a concrete business outcome — recruiting people, using their
resources, closing deals, and outmaneuvering a rival operator while managing cash,
exposure, and reputation.

The interface language is Russian; all code, comments, and documentation are in
English.

## Prerequisites

- Rust (stable) with the platform build tools required by Tauri
- Node.js 20 LTS (see `.nvmrc`)
- pnpm

Refer to the Tauri prerequisites guide for the system packages your platform
needs.

## Getting started

```bash
pnpm install
pnpm tauri dev
```

`pnpm tauri dev` builds the frontend, compiles the Rust shell, and opens the
desktop window with hot reload.

## Building

```bash
pnpm build        # type-check and bundle the frontend
pnpm tauri build  # produce a desktop build
```

## Scripts

| Script            | Description                       |
| ----------------- | --------------------------------- |
| `pnpm dev`        | Start the Vite dev server         |
| `pnpm build`      | Type-check and build the frontend |
| `pnpm typecheck`  | Type-check without emitting       |
| `pnpm lint`       | Lint the codebase                 |
| `pnpm format`     | Format the codebase               |
| `pnpm test`       | Run the test suite once           |
| `pnpm test:watch` | Run tests in watch mode           |
| `pnpm test:cov`   | Run tests with coverage           |
| `pnpm tauri`      | Run the Tauri CLI                 |
| `pnpm prepare`    | Install Git hooks (Husky)         |

## Project structure

```
src/
  engine/   Pure TypeScript game logic (no UI, DOM, or I/O)
  ui/       React interface: components, styles, i18n
src-tauri/  Rust desktop shell and configuration
docs/adr/   Architecture decision records
```

The `engine` and `ui` layers are deliberately separated; the rationale and the
other foundational decisions are recorded in `docs/adr`.
