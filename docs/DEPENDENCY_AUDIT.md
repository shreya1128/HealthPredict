# Dependency Audit (2026-10-23)

Tools: `pip-audit` (Python) and `npm audit` (web, mobile). Findings are classified by whether the code reaches
users (the browser bundle or the phone app) or only runs on a developer machine (test runner, bundler, CLI).

## Python backend
`pip-audit -r backend/requirements.txt`: **no known vulnerabilities.**

## Web (`web/`)

| | Before | After |
|---|---|---|
| Findings in dependencies that ship | 1 high | **0** |
| Findings in dev-only tooling | 23 | 22 |

- **Fixed:** `follow-redirects` 1.16.0 → 1.16.1 (high; pulled in by `axios`). Lockfile-only change, no `package.json` change.
  This package is not in the browser bundle (checked: 0 files in `dist/`), so the shipped app was not exposed, but it is patched anyway.
  Also moved two patch-level transitive packages (6.1.4 → 6.1.5, 1.2.1 → 1.2.2).
- **Verified after the fix:** `npm ci` exit 0, 170 Vitest tests pass, `vite build` succeeds.
- **Left open on purpose (dev-only, each fix is a major-version jump):**
  - `vitest` / `@vitest/ui` / `tinypool` (3 critical): remote file read/execution **only while the Vitest UI server is running**
    (`npx vitest --ui`); and a prototype-pollution gadget in test worker options. Do not run the Vitest UI on a shared or public network.
    Fix is Vitest 5.x (breaking).
  - `vite` (high): dev-server path traversal / `server.fs.deny` bypass on Windows, **only while `npm run dev` is running**. Fix is Vite 8 (breaking).
  - `tailwindcss` (via `micromatch` / `braces` / `chokidar`), `eslint-config-react-app` (via `@typescript-eslint`): build/lint-time only. Fixes are breaking.
  - Recommendation: schedule a planned upgrade of Vite, Vitest and Tailwind (with a full test and build run), not an automatic `npm audit fix --force`.

## Mobile (`mobile/`)

`npm audit` reports 55 entries (6 moderate, 49 high). They collapse into **four root advisories**:

| Advisory | Package | Reaches the phone app? | Fix available? |
|---|---|---|---|
| Stack exhaustion on deeply nested patterns (high) | `braces` 3.0.3 | No: Metro bundler / Jest file matching (build and test time) | **No.** 3.0.3 is the newest published release |
| RSA signature verification flaw (high) | `node-forge` 1.4.0 | No: Expo CLI code-signing helper | **No.** 1.4.0 is the newest published release |
| Denial of service on malformed percent-encoding (moderate) | `decode-uri-component` 0.2.2 via `expo-router` → `query-string` | Yes, in principle: parses URL query strings. Impact is limited to a crafted link making the app slow | Only a breaking jump (0.5.0) inside a third-party package |
| Buffer bounds check (moderate) | `uuid` 7.0.3 via `xcode` (Expo iOS config plugin) | No: runs when the iOS project is generated | Needs `xcode` to update |

- **No changes made.** npm's suggested automatic fixes would install `expo-router@58`, Expo 44 or React Native 0.72, which do not match
  the installed Expo SDK 57 and would likely break the app. The numbers npm prints are inflated by this chain of related packages.
- **Action:** re-run `npm audit` after each Expo SDK upgrade; when patched `braces` / `node-forge` releases appear they will arrive through Expo.
- Not verified: whether `decode-uri-component` can be safely overridden in the built app (needs a device/emulator run).
