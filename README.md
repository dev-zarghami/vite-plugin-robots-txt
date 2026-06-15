# vite-plugin-robots-txt

> Generate a `robots.txt` for any Vite app — framework-agnostic, env-aware, with a no-store dev preview. Zero dependencies, fully typed, ESM + CJS.

```ts
import generateRobotsTxt from 'vite-plugin-robots-txt';

export default defineConfig({
  plugins: [generateRobotsTxt()],
});
```

---

## Features

- 🧩 **Framework-agnostic** — React, Vue, Svelte/SvelteKit, Solid, Astro, vanilla.
- 📝 **Simple, typed API** — static `policies` or a dynamic `policyBuilder(ctx)`.
- 🌍 **Env-aware** — every dynamic option receives `{ mode, command, root }`.
- 🗺️ **Sitemaps & crawl-delay** — static or computed per build.
- 🧪 **Live dev preview** — served with `Cache-Control: no-store` so edits show instantly, and **honors a custom Vite `base`**.
- 📦 **Build asset** — emitted to your build output root, with an optional on-disk mirror.
- 🟢 **Zero runtime dependencies.**

---

## Installation

```bash
npm i -D vite-plugin-robots-txt
# or: pnpm add -D vite-plugin-robots-txt
# or: yarn add -D vite-plugin-robots-txt
```

Requires **Node ≥ 18** and **Vite ≥ 4** (tested on Vite 5).

---

## Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import generateRobotsTxt from 'vite-plugin-robots-txt';

export default defineConfig({
  plugins: [generateRobotsTxt()],
});
```

With no options you get a neutral, allow-all file:

```text
User-agent: *
Allow: /
```

- **dev** (`vite`) — served at the `robots.txt` route (under your `base`) with no-store headers.
- **build** (`vite build`) — emitted as a build asset to the **root of your build `outDir`** (e.g. `dist/robots.txt`).

> Place the plugin after your framework plugin in the `plugins` array.

---

## API

```ts
generateRobotsTxt(options?: RobotsOptions): Plugin
```

### `RobotsOptions`

| Option          | Type                                          | Default          | Description |
|-----------------|-----------------------------------------------|------------------|-------------|
| `filename`      | `string`                                      | `"robots.txt"`   | Output filename. |
| `policies`      | `RobotsPolicy[]`                              | allow-all        | Explicit user-agent blocks. When non-empty, **takes precedence** over `policyBuilder`. |
| `policyBuilder` | `(ctx) => RobotsPolicy[]`                     | —                | Build policies dynamically from the build context. |
| `sitemaps`      | `string[] \| (ctx) => string[] \| undefined`  | —                | `Sitemap:` URLs, static or computed. |
| `footerComment` | `string \| (ctx) => string \| undefined`      | —                | Trailing `# comment` line, static or computed. |
| `noStoreInDev`  | `boolean`                                     | `true`           | Serve the dev file with no-store headers. |
| `outputDir`     | `string`                                      | —                | Also mirror the file to this directory on disk (relative to project root), in **both** dev and build. |

### `RobotsPolicy`

```ts
interface RobotsPolicy {
  userAgent?: string;   // default "*"
  allow?: string[];     // -> Allow: <path>
  disallow?: string[];  // -> Disallow: <path>
  crawlDelay?: number;  // -> Crawl-delay: <seconds>
}
```

Paths within each policy are de-duplicated automatically.

### `RobotsContext` (passed to every function-form option)

```ts
interface RobotsContext {
  mode: string;               // "development" | "production" | custom
  command: 'serve' | 'build';
  root: string;               // absolute project root
}
```

---

## Recipes

### Block everything outside production

```ts
generateRobotsTxt({
  policyBuilder: ({ mode }) =>
    mode === 'production'
      ? [{ userAgent: '*', allow: ['/'] }]
      : [{ userAgent: '*', disallow: ['/'] }],
});
```

### Multiple user agents + crawl delay

```ts
generateRobotsTxt({
  policies: [
    { userAgent: 'Googlebot', allow: ['/'], disallow: ['/no-google'] },
    { userAgent: 'Bingbot', allow: ['/'], crawlDelay: 10 },
    { userAgent: '*', allow: ['/'], disallow: ['/admin', '/preview'] },
  ],
});
```

Produces:

```text
User-agent: Googlebot
Allow: /
Disallow: /no-google

User-agent: Bingbot
Allow: /
Crawl-delay: 10

User-agent: *
Allow: /
Disallow: /admin
Disallow: /preview
```

### Environment-aware sitemaps and footer

```ts
generateRobotsTxt({
  sitemaps: ({ mode }) =>
    mode === 'production' ? ['https://example.com/sitemap.xml'] : [],
  footerComment: ({ mode }) => `generated for ${mode}`,
});
```

### Mirror to a static folder

If your framework serves a static directory (e.g. SvelteKit's `static/`), mirror the file there too:

```ts
generateRobotsTxt({ outputDir: 'static' });
```

The mirror is written only when its contents change.

---

## How it works

| Phase | Behavior |
|-------|----------|
| `vite` (dev) | A middleware answers the `robots.txt` route (resolved against your Vite `base`). With `noStoreInDev` (default) the response carries `Cache-Control: no-store` so changes appear on every refresh. |
| `vite build` | The file is emitted via Rollup's asset pipeline to the root of your build `outDir`. |
| `outputDir` | When set, the file is also written to disk in both dev and build — skipped if unchanged. |

> The dev middleware takes precedence over a physical file at the same route, so the preview always reflects your current config.

---

## Troubleshooting

- **404 in dev** — ensure the plugin is in `plugins` (after your framework plugin) and you're hitting the route under your configured `base`.
- **Stale content** — the dev response is `no-store`; if a proxy/CDN still caches, set headers at the edge.
- **Wrong location on a sub-path deploy** — the build asset lands at the build output root; configure your host to serve it from the site root, or use `outputDir` to place it in your static folder.

---

## License

[MIT](./LICENSE) © dev.zarghami
