# ✨ dufs-lume-ui

[简体中文](./README.md) · [English](./README.en.md)

> ⚠️ **This project is AI-developed.** The code and documentation were written primarily by an AI assistant, with a human providing requirements, making decisions and accepting results. **It has not been through a rigorous security audit, nor a systematic code review.** Treat it as a working, readable reference implementation rather than a verified product. Details: [AI development notes & security boundaries](./docs/ai-development-notes.en.md).

**dufs-lume-ui** is a modern, responsive standalone frontend theme for [Dufs (`sigoden/dufs`)](https://github.com/sigoden/dufs), a lightweight static file server. It runs on Dufs' native `--assets` override mechanism — the default UI is replaced without touching or recompiling Dufs itself — and optionally integrates a lightweight extension API (`/__lume__/info` and `/__lume__/thumb`) for live storage metrics, server-side thumbnail generation, and authentication via [Caddy](https://caddyserver.com/docs/caddyfile/directives/forward_auth) + [TinyAuth](https://tinyauth.app/docs/community/caddy/).

## 🌟 Features

- **Two views, one toggle (list & grid)**:
  - Table and card layouts switch instantly; the preference persists to `localStorage`.
  - The breadcrumb bar carries a "go up one level" button (`Backspace` / `Alt + ↑`); anonymous visitors are locked to the public folder (default `/share/`) as their root.
  - **Dense by default**: duplicate sort controls are hidden in list view and collapsed into a single pill in grid view; storage usage lives in the breadcrumb and only raises a banner when space actually gets low.
- **Keyboard-first interaction and full multi-select**:
  - **Keyboard roaming and instant preview with `Space`**: arrow keys move focus between entries (auto-scrolling the viewport), `Space` opens/closes the preview modal, `Enter` opens it.
  - **Paste to upload (`Ctrl` / `Cmd + V`)**: copy a screenshot or a snippet anywhere on the page, hit the shortcut, rename, confirm — it streams straight up.
  - Header select-all with an indeterminate state, a grid select-all pill, `Ctrl` / `Cmd` + click for single selection, `Shift` + click for ranges.
  - With nothing selected, the browser calls Dufs' native `?zip` for the current directory; with a selection, a ZIP is streamed client-side using [fflate](https://github.com/1000tb/fflate) `ZipPassThrough` (STORE).
  - Full-screen drag-and-drop streaming upload (`HTTP PUT`); cancelling mid-upload issues a follow-up `HTTP DELETE` so no partial file is left on the server.
- **Rich media preview, HTML sandboxing, floating audio player**:
  - **Floating mini audio player**: collapse a preview into a pill in the bottom-right corner (pause, auto-advance within the folder, expand back) and keep listening while browsing other directories.
  - **One-click static site browsing**: when a folder contains `index.html`, a "browse site" button appears next to the breadcrumb.
  - Preview modal for images, video, audio, Markdown (rendered/source toggle), PDF and syntax-highlighted code, with `←` / `→` to step through files.
  - `.html` / `.htm` render inside an **isolated sandbox** by default (`srcdoc` + `sandbox="allow-scripts"`, deliberately *without* `allow-same-origin`) so untrusted pages cannot reach site credentials or private files. Sites that rely on relative assets can opt out of the sandbox after a second confirmation, from the preview banner or from preferences.
- **Adaptive thumbnails (auto / on / off)**:
  - A three-state preference (persisted in `localStorage`) plus an inline indicator of what the server can actually do (server-side resizing vs. browser-side scaling only).
  - When `/__lume__/info` advertises thumbnail support, scaled images are fetched from `/__lume__/thumb`; without an image toolchain the UI falls back to browser-scaled originals or plain file icons.
- **A single merged probe (`/__lume__/info`)**:
  - Page load sends **exactly one `GET /__lume__/info`**. If the auth gateway intercepts it (`302/401`) the UI switches to read-only visitor mode; a `200 JSON` response simultaneously confirms the session, shows live free space and discovers server capabilities — and nothing is ever written into the data directory. It refreshes silently after uploads and deletions.
- **Motion and runtime branding**:
  - Modals, dropdowns and toasts use a `cubic-bezier(0.16, 1, 0.3, 1)` curve; cards lift and images scale on hover.
  - Docker environment variables (`LUME_TITLE`, `LUME_SUBTITLE`, `LUME_ICON`, `LUME_LOGIN_URL`) inject branding at container start — no rebuild needed.
  - Ships with Simplified Chinese and English locales plus light/dark themes, following the system preference by default.

## 📁 Repository layout

```text
dufs-lume-ui/
├── index.html                        # HTML entry (Dufs injection placeholders + runtime branding node)
├── package.json                      # dependencies and build scripts
├── vite.config.ts                    # Vite config and the __ASSETS_PREFIX__ rewrite plugin
├── public/
│   └── favicon.svg                   # default site icon
├── docker/
│   ├── compose.yaml                  # one-command orchestration (Dufs + extension API + Caddy, same origin)
│   ├── Dockerfile.ui                 # frontend build + Dufs runtime image
│   ├── Dockerfile.api                # extension API image (socat + libvips/ImageMagick)
│   ├── entrypoint-ui.sh              # branding injection at container start
│   ├── Caddyfile                     # same-origin reverse proxy inside the container network
│   └── .env.example                  # configuration template
├── scripts/
│   └── lume-info-api.sh              # POSIX sh extension API (serves /__lume__/info and /__lume__/thumb)
├── docs/
│   ├── deployment-and-lume-api.md    # advanced deployment, extension API contract, safety constraints, ops checklist
│   ├── ai-development-notes.md       # AI development notes (Chinese)
│   └── ai-development-notes.en.md    # AI development notes (English)
└── src/
    ├── App.tsx                       # main state orchestration: merged probe, keyboard roaming, paste upload, mini player
    ├── i18n.ts                       # i18next bootstrap
    ├── locales/                      # Simplified Chinese (zh.json) and English (en.json)
    ├── types/dufs.ts                 # TypeScript definitions
    ├── utils/format.ts               # byte/time formatting, file classification, path normalization
    ├── services/
    │   ├── dufsApi.ts                # Dufs API wrapper, merged probe, thumbnail URL builder
    │   └── zipSelection.ts           # client-side streaming ZIP
    └── components/                   # UI components (Navbar / Breadcrumbs / FileExplorer / MediaPreviewModal …)
```

## 🚀 Local development and build

```bash
# 1. install dependencies
pnpm install

# 2. start the dev server (it boots into the built-in interactive demo mode)
pnpm run dev

# 3. production build (output in ./dist)
pnpm run build
```

## 🐳 Docker Compose quick start

The `docker/` directory ships a three-container, same-origin stack (`dufs` + `lume-info-api` + `caddy`):

> Requires **Docker Engine 20.10+ and Compose v2.24+** — the `env_file.required` field was added in v2.24;
> older versions fail with `unknown field "required"`. Check with `docker compose version`.

```bash
cd docker
cp .env.example .env
# edit DATA_DIR (host data directory) and LUME_HTTP_PORT (public port) in .env
docker compose up -d --build
```

- **Branding**: set `LUME_TITLE`, `LUME_SUBTITLE`, `LUME_ICON`, `LUME_LOGIN_URL` in `.env` and restart the container — no frontend rebuild.
- **Dufs options pass straight through**: Dufs 0.47+ maps every command-line option to a `DUFS_*` environment variable (`DUFS_ALLOW_UPLOAD=true`, `DUFS_ALLOW_DELETE=true`, `DUFS_ALLOW_SEARCH=true`, `DUFS_ALLOW_ARCHIVE=true`, …). ⚠ These variables are "present means set" — **never leave one empty**: a bare `DUFS_AUTH=` is parsed as an auth rule and every anonymous request starts failing with 401. Comment it out or give it a real value.
- **The default stack has no authentication**: there is no TinyAuth in the bundle and `LUME_BIND` defaults to `127.0.0.1` (loopback only, behind your own TLS proxy). ⚠ Do **not** set `LUME_BIND=0.0.0.0` together with `DUFS_ALLOW_UPLOAD=true` on an unauthenticated instance — that is an open upload endpoint. If you want to expose it directly, enable HTTPS first (drop `auto_https off` and give Caddy a real domain) and configure at least one `DUFS_AUTH` rule.
- **dufs runs as root inside the container**: with write access enabled, uploaded files end up owned by root. Map your own UID/GID with compose's `user:` and make sure `DATA_DIR` is writable by it.

## 📦 Bare-metal deployment (Dufs + Caddy + TinyAuth)

1. **Serve the built assets with Dufs**:
   ```bash
   dufs /var/lib/dufs -A --assets /path/to/dufs-lume-ui/dist -p 5000
   ```
2. **Run the extension API (`socat` listening on `127.0.0.1:8090`)**:
   ```bash
   sudo cp scripts/lume-info-api.sh /usr/local/sbin/lume-info-api.sh
   sudo chmod 0755 /usr/local/sbin/lume-info-api.sh
   DUFS_SERVE_PATH=/var/lib/dufs THUMB_CACHE_DIR=/var/lib/lume/thumbs \
     socat TCP-LISTEN:8090,bind=127.0.0.1,reuseaddr,fork \
     EXEC:/usr/local/sbin/lume-info-api.sh
   ```
   > Server-side thumbnails need `libvips-tools` (`vipsthumbnail`) or ImageMagick (`convert`). If neither is installed, `/__lume__/info` reports `thumbs: false` and the frontend degrades automatically — no configuration change required.
3. **Wire it up in the `Caddyfile`**:
   ```caddyfile
   files.example.com {
       encode zstd gzip

       @gated {
           not path /share* /__dufs_v*
       }

       handle @gated {
           forward_auth tinyauth:3000 {
               uri /api/auth/caddy
               copy_headers Remote-User Remote-Email Remote-Name
           }

           handle /__lume__/* {
               reverse_proxy 127.0.0.1:8090
           }

           reverse_proxy dufs:5000
       }

       handle {
           reverse_proxy dufs:5000
       }
   }
   ```

> 📖 **Advanced documentation**: response contract of the extension API, the thumbnail safety boundaries, the systemd unit and operational notes are in **[`docs/deployment-and-lume-api.md`](./docs/deployment-and-lume-api.md)**.

## 📄 License

Released under the [MIT License](./LICENSE).
