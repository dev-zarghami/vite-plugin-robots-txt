import path from 'node:path';
import type { Logger, Plugin } from 'vite';
import { writeFileIfChanged } from './internal/fs';
import { publicRoute, setNoStore } from './internal/server';

const PLUGIN_NAME = 'vite-plugin-robots-txt';
const TAG = '[robots]';
const DEFAULT_FILENAME = 'robots.txt';

/** Context passed to every dynamic (function-form) option. */
export interface RobotsContext {
  /** Vite mode — `"development"`, `"production"`, or a custom mode. */
  mode: string;
  /** Vite command for this run. */
  command: 'serve' | 'build';
  /** Absolute project root. */
  root: string;
}

/** A value that may be provided directly or computed from the build context. */
export type Resolvable<T> = T | ((ctx: RobotsContext) => T);

/** A single `User-agent` block. */
export interface RobotsPolicy {
  /** User agent this block targets. Defaults to `"*"`. */
  userAgent?: string;
  /** `Allow:` paths. */
  allow?: string[];
  /** `Disallow:` paths. */
  disallow?: string[];
  /** Optional `Crawl-delay:` in seconds. */
  crawlDelay?: number;
}

export interface RobotsOptions {
  /** Output filename. Defaults to `"robots.txt"`. */
  filename?: string;
  /** Explicit user-agent blocks. When non-empty, takes precedence over `policyBuilder`. */
  policies?: RobotsPolicy[];
  /** Build policies dynamically from the build context. */
  policyBuilder?: (ctx: RobotsContext) => RobotsPolicy[];
  /** `Sitemap:` URLs, static or computed. */
  sitemaps?: Resolvable<string[] | undefined>;
  /** Trailing comment line (rendered as `# ...`), static or computed. */
  footerComment?: Resolvable<string | undefined>;
  /** Serve dev `robots.txt` with no-store headers. Defaults to `true`. */
  noStoreInDev?: boolean;
  /**
   * Also mirror the file to this directory on disk (relative to project root),
   * in both dev and build. Independent of the emitted build asset.
   */
  outputDir?: string;
}

const DEFAULT_POLICIES: RobotsPolicy[] = [{ userAgent: '*', allow: ['/'] }];

const uniq = (values?: string[]): string[] => Array.from(new Set(values ?? []));

const resolve = <T>(value: Resolvable<T> | undefined, ctx: RobotsContext): T | undefined =>
  typeof value === 'function' ? (value as (c: RobotsContext) => T)(ctx) : value;

function serializeBlock(policy: RobotsPolicy): string {
  const userAgent = (policy.userAgent ?? '*').trim() || '*';
  const out = [`User-agent: ${userAgent}`];
  for (const allow of uniq(policy.allow)) out.push(`Allow: ${allow}`);
  for (const disallow of uniq(policy.disallow)) out.push(`Disallow: ${disallow}`);
  if (policy.crawlDelay != null) out.push(`Crawl-delay: ${policy.crawlDelay}`);
  return out.join('\n');
}

function render(ctx: RobotsContext, opts: RobotsOptions): string {
  const policies =
    (opts.policies?.length ? opts.policies : undefined) ??
    opts.policyBuilder?.(ctx) ??
    DEFAULT_POLICIES;

  const sections = [policies.map(serializeBlock).join('\n\n') + '\n'];

  const sitemaps = resolve(opts.sitemaps, ctx);
  if (sitemaps?.length) {
    sections.push(sitemaps.map((url) => `Sitemap: ${url}`).join('\n') + '\n');
  }

  const footer = resolve(opts.footerComment, ctx)?.trim();
  if (footer) sections.push(`# ${footer}\n`);

  return sections.join('\n');
}

/**
 * Vite plugin that generates a `robots.txt`:
 * - **build**: emitted as a build asset (lands at the root of your build `outDir`);
 * - **dev**: served from the `robots.txt` route with no-store headers;
 * - **optional**: mirrored to `outputDir` on disk in both modes.
 */
export function generateRobotsTxt(options: RobotsOptions = {}): Plugin {
  const filename = options.filename ?? DEFAULT_FILENAME;
  const noStoreInDev = options.noStoreInDev ?? true;

  let logger!: Logger;
  let base = '/';
  let ctx: RobotsContext = { mode: 'production', command: 'build', root: process.cwd() };

  return {
    name: PLUGIN_NAME,

    configResolved(config) {
      logger = config.logger;
      base = config.base || '/';
      ctx = {
        mode: config.mode,
        command: config.command,
        root: config.root || process.cwd(),
      };
    },

    async buildStart() {
      if (!options.outputDir) return;
      const outPath = path.resolve(ctx.root, options.outputDir, filename);
      await writeFileIfChanged(outPath, render(ctx, options), logger, TAG);
    },

    generateBundle() {
      this.emitFile({ type: 'asset', fileName: filename, source: render(ctx, options) });
      logger.info(`${TAG} emitted ${filename}`);
    },

    configureServer(server) {
      const route = publicRoute(base, filename);
      server.middlewares.use(route, (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        if (noStoreInDev) setNoStore(res);
        res.end(render(ctx, options));
      });
      logger.info(`${TAG} dev route mounted → ${route}${noStoreInDev ? ' (no-store)' : ''}`);
    },
  };
}

export default generateRobotsTxt;
