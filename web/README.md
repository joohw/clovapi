# Browser management UI

Typography is centralized in `src/typography.css`: Outfit Variable (bundled locally), system Chinese fallback, and monospace only for raw log bodies. Use the shared 13/14/18/24/28px size tokens; the root stays at 16px so Tailwind rem units remain predictable. Keep the black-and-white theme.

Shared controls use shadcn/ui with Tailwind CSS 4. Components live in `src/components/ui`; add more from `web/` using `npx shadcn@latest add <component>`. Keep theme tokens in `src/shadcn.css` aligned with the black-and-white theme.

React + Vite. No Electron, Node server, or browser extension is required at runtime.

Management pages use `/models`, `/providers`, `/call-logs`, `/system-logs`, and `/settings`. Links use browser history, so direct navigation, refresh, and back/forward work in both development and the embedded Go build. Existing `/#...` bookmarks automatically migrate to the corresponding path. Unknown paths and missing assets keep their normal error responses.

From the repository root:

```sh
npm ci --prefix web
npm run dev
```

Open http://127.0.0.1:31873 in a browser. Vite hot reloads the UI and forwards `/api/admin` to Go on port 27484. The Go watcher rebuilds and restarts the management service and proxy when core source changes.

React Fast Refresh updates components while preserving compatible local state; CSS changes apply immediately. With `serve --dev`, port **27484** also forwards the UI and hot-reload WebSocket to Vite, so both development addresses show current source changes. An already-open embedded page needs one refresh to load the Vite client. Plain `serve` without `--dev` serves the embedded production build and does not hot reload. If Go is already running with `serve --dev`, `npm run dev:web` from the root starts just the frontend.

```sh
npm run check:web
npm --prefix web test
npm run build
./core/clovapi serve
```

On Windows use `core\clovapi.exe serve`. Open http://127.0.0.1:27484. The Vite static build is embedded in the Go binary, so the binary can be copied and launched outside the source directory with no Node installation.

Management binds only to loopback, independently of the configured proxy address (default port 27483). Stopping/rebinding the proxy does not stop the management page. Closing a browser tab does not stop either service. Ctrl+C stops `serve`; stop the detached proxy with `clovapi proxy stop`.

`clovapi serve --port 27485` changes only the management port. `--no-proxy` opens management without automatically starting the proxy. Production rejects cross-origin administration. `--dev` serves the Vite UI (including hot reload) through the management port and explicitly permits the local Vite origin. It requires Vite to be running on port 31873.

Subscription sign-in opens an OAuth tab; when the browser blocks popups, the page offers a sign-in link. Desktop tray and installer updates have been removed. Update the Go binary using the CLI/install mechanism and restart `serve`.
