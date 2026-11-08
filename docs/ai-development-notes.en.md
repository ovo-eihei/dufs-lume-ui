# AI development notes & security boundaries

[简体中文](./ai-development-notes.md) · [English](./ai-development-notes.en.md)

The code and documentation in this repository were **written primarily by an AI assistant**. A human supplied the requirements, made the technical trade-offs and accepted the results. This document states three things: how far it was actually taken, what was not done, and what homework you should still do yourself.

## 1. How it was developed

- 1A **Humans set direction, the agent executes**: the feature list, UI decisions and deployment shapes were proposed and accepted one round at a time by a human; the AI wrote the code, ran the builds, performed the verification and wrote the conclusions into these docs.
- 1B **Commit history is the process record**: commits land per accepted batch of changes, with messages in Chinese.
- 1C **Docs and code share one source of truth**: the numbers in `docs/` (timings, byte counts, response codes) were measured on a real machine during development rather than copied from upstream documentation — but they were measured **on that one machine and that one version only**. Re-check them in your own environment.

## 2. What was actually verified

- 2A **Build and types**: `pnpm build` runs `tsc -b && vite build`; type checking and the build must be green before a commit. The build is deterministic — rebuilding the same sources produces the same content hashes in the output file names.
- 2B **That the theme is really being served**: verified with `curl` against a loopback port using browser-shaped headers (`Accept: text/html` plus a `Mozilla/5.0` UA). ⚠ Dufs branches on `Accept`: `Accept: */*` returns its own minimal built-in page, not our `index.html`.
- 2C **Safety gates of the extension API**: the seven checks in `scripts/lume-info-api.sh` (absolute path required, `..` rejected, control characters rejected, symlink escape rejected, public-area prefix, extension whitelist, unwritable cache → 500) were exercised both with a stubbed image tool and with a real one; expected codes are listed in deployment doc §7.
- 2D **The Docker stack end to end**: `docker compose up -d --build` ran through on Linux/amd64 — three containers up, healthcheck reporting `(healthy)`, `/__lume__/info` capability flags, `/__lume__/thumb` producing a real image, static assets byte-identical through Caddy versus on disk, and branding values containing quotes/backslashes/`&` surviving the round trip.
- 2E **UI behaviour**: accepted by a human in a real browser (clicks, long press, keyboard, narrow viewports). **There are no automated UI tests**, so any claim that "this control works" comes from manual operation, not from a test suite.

## 3. What was not done — treat these as known gaps

- 3A **No unit tests, no integration tests, no E2E framework.** There is no test directory and no `test` script in `package.json`. "It builds" does not mean "it behaves correctly".
- 3B **No independent security review.** No third-party code audit, no penetration test, and no formal analysis of the input surface of `scripts/lume-info-api.sh` (POSIX sh that handles untrusted input and shells out to external tools).
- 3C **No dependency scanning.** `pnpm audit`, Snyk and Dependabot were not run or configured, and upstream images are referenced by tag (`sigoden/dufs:v0.47.0`) rather than by digest.
- 3D **No accessibility (a11y) review** and no screen-reader verification; keyboard navigation only covers what this project implements itself.
- 3E **No cross-browser matrix.** The main verification targets were recent Chrome/Chromium and iOS Safari; Firefox, desktop Safari and older WebViews are untested.
- 3F **No performance benchmark suite.** The timings in the docs are single measured samples, not statistical results.
- 3G **Two locales only (zh / en)**, and the English copy is AI-generated without review by a native speaker.

## 4. Security boundaries: what this project is responsible for, and what it is not

- 4A **Authentication is not in this project's hands.** The frontend has no access-control capability at all — it infers "am I a visitor?" purely from whether its request was intercepted with `302/401` by the gateway. The real boundary is your reverse proxy (`forward_auth`) and Dufs' own `--auth` / `DUFS_AUTH` rules. **With no `-a` rule configured, Dufs always reports `user: null` and `allow_upload: true`**, so the frontend cannot distinguish a logged-in session from an anonymous one on its own.
- 4B **The Docker bundle ships without authentication and binds to loopback by default.** Read the two warnings in the Docker section of the README before exposing it.
- 4C **The HTML preview sandbox is a mitigation, not a guarantee.** It renders with `sandbox="allow-scripts"` and deliberately without `allow-same-origin`; a user can disable it after a second confirmation — and once disabled, the previewed page is same-origin and can read everything that session can read. Do not turn it off for untrusted `.html`.
- 4D **The extension API can reach exactly the data root it is mounted on.** The script only serves paths inside `DUFS_SERVE_PATH` that still resolve inside it after `readlink -f`; in the Docker stack that mount is read-only. If you expose `/__lume__/thumb` outside authentication (deployment doc §6(4)), then `root=share` is the only line of defence — use the overriding `set_query`, never `replace_query`.
- 4E **The thumbnail cache lives outside the data root** (default `/var/lib/lume/thumbs`, a separate volume in the container). It does not pollute your files, but it contains scaled copies of them — treat it as sensitive when backing up or syncing.
- 4F **Multi-user permissions are out of scope.** Who may read, write or delete is decided by Dufs' auth rules and your proxy; the frontend only renders the `allow_*` flags Dufs returns.

## 5. Homework before you rely on it

- 5A Read `scripts/lume-info-api.sh` (the only part that handles untrusted input and calls external commands) and `src/services/dufsApi.ts`.
- 5B Run the self-check commands from deployment doc §7 on your own machine and confirm the response codes match.
- 5C Before going live, at minimum: configure a real auth rule for the instance, verify `DATA_DIR` ownership, run `pnpm audit` once, and keep the output of `docker compose ps` and `curl /__lume__/info` on file.
- 5D If you modify the frontend, note that build outputs carry content hashes and are served as `immutable` by Dufs — release by replacing the whole directory **and restarting Dufs** (it reads `index.html` exactly once, at startup).

## 6. Reporting problems

- 6A Bugs and feature requests: use the issue templates in `.github/ISSUE_TEMPLATE/`. Anything that is not a security problem is welcome in public.
- 6B **Please do not report security issues publicly.** Use GitHub's private vulnerability reporting (Security → Report a vulnerability) and avoid exploitable detail or unpatched reproduction steps in public issues.
- 6C This project moves fast and is verified mostly by hand, so **a number of latent defects are expected**. Treat section 3 as a to-do list for your own review, not as a disclaimer.

## 7. No warranty

The MIT licence provides this software "AS IS", without warranty of any kind. This project makes no security guarantee and accepts no liability for data loss or exposure resulting from its use.
