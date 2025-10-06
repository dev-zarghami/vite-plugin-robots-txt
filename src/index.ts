import fs from "node:fs";
import path from "node:path";
import type {Plugin, ResolvedConfig, Logger} from "vite";

/**
 * ---------------------------------------------------------------------------
 *  Vite Plugin: vite-plugin-robots-txt
 *  - Emits robots.txt in build
 *  - Serves robots.txt in dev with no-store
 *  - Optional mirror to disk via outputDir (both dev & prod)
 *  - Unified style, Vite logger, no external helpers
 * ---------------------------------------------------------------------------
 */

/** One user-agent block */
export type RobotsPolicy = {
    userAgent?: string;   // default "*"
    allow?: string[];
    disallow?: string[];
};

export type RobotsOptions = {
    filename?: string; // default "robots.txt"

    // Static policies (wins over builder if provided and non-empty)
    policies?: RobotsPolicy[];

    // Build from current ctx
    policyBuilder?: (ctx: { mode: string; command: "serve" | "build"; root: string }) => RobotsPolicy[];

    // Sitemaps
    sitemaps?: string[] | ((ctx: { mode: string; command: "serve" | "build"; root: string }) => string[] | undefined);

    // Footer as comment
    footerComment?: string | ((ctx: { mode: string; command: "serve" | "build"; root: string }) => string | undefined);

    // Control dev caching
    noStoreInDev?: boolean; // default true

    // Optional disk mirror (dev & prod)
    outputDir?: string;
};

// ----------------- utils -----------------

const DEFAULT_FILENAME = "robots.txt";

function uniq<T>(arr?: T[]) {
    return Array.from(new Set(arr ?? []));
}

function lines(...xs: Array<string | null | undefined | false>) {
    return xs.filter(Boolean).map((x) => String(x));
}

function serializePolicies(policies: RobotsPolicy[]) {
    const blocks: string[] = [];

    for (const p of policies) {
        const ua = (p.userAgent ?? "*").trim() || "*";
        const dis = uniq(p.disallow).map((d) => `Disallow: ${d}`);
        const allow = uniq(p.allow).map((a) => `Allow: ${a}`);
        const block = lines(`User-agent: ${ua}`, ...dis, ...allow, "").join("\n");
        blocks.push(block);
    }

    return blocks.join("\n").trimEnd() + "\n";
}

/** Default policy = allow all */
function defaultPolicies(): RobotsPolicy[] {
    return [{userAgent: "*", allow: ["/"], disallow: []}];
}

function buildContent(
    ctx: { mode: string; command: "serve" | "build"; root: string },
    opts: RobotsOptions
) {
    const policies =
        (opts.policies && opts.policies.length ? opts.policies : undefined) ??
        (opts.policyBuilder ? opts.policyBuilder(ctx) : undefined) ??
        defaultPolicies();

    const head = serializePolicies(policies);

    const sitemaps =
        typeof opts.sitemaps === "function"
            ? opts.sitemaps(ctx)
            : Array.isArray(opts.sitemaps)
                ? opts.sitemaps
                : undefined;
    const smBlock = sitemaps?.length ? sitemaps.map((u) => `Sitemap: ${u}`).join("\n") + "\n" : "";

    const foot = typeof opts.footerComment === "function" ? opts.footerComment(ctx) : opts.footerComment ?? undefined;
    const footerBlock = foot ? `\n# ${foot.trim()}\n` : "";

    return (head + (smBlock ? `\n${smBlock}` : "") + footerBlock).replace(/\n{3,}$/g, "\n\n");
}

async function writeFileIfChanged(filePath: string, content: string, logger: Logger) {
    try {
        const existed = fs.existsSync(filePath);
        const prev = existed ? await fs.promises.readFile(filePath, "utf8") : null;
        if (prev === content) {
            logger.info?.(`[robots] no changes: ${filePath}`);
            return false;
        }
    } catch {
        // ignore
    }
    await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
    await fs.promises.writeFile(filePath, content, "utf8");
    logger.info(`[robots] wrote ${filePath}`);
    return true;
}

// ----------------- Vite plugin -----------------

export function generateRobotsTxt(options: RobotsOptions = {}): Plugin {
    const filename = options.filename ?? DEFAULT_FILENAME;
    const noStoreInDev = options.noStoreInDev ?? true;

    let resolvedConfig!: ResolvedConfig;
    let logger!: Logger;
    let mode = "production";
    let command: "serve" | "build" = "build";
    let root = process.cwd();

    const buildTxt = () => {
        const ctx = {mode, command, root};
        return buildContent(ctx, options);
    };

    return {
        name: "vite-plugin-robots-txt",
        apply: () => true,

        configResolved(config) {
            resolvedConfig = config;
            logger = config.logger;
            root = config.root ?? process.cwd();
            mode = config.mode;
            command = config.command as "serve" | "build";
        },

        async buildStart() {
            const txt = buildTxt();
            if (options.outputDir) {
                const outPath = path.resolve(root, options.outputDir, filename);
                await writeFileIfChanged(outPath, txt, logger);
            }
        },

        generateBundle() {
            const txt = buildTxt();
            this.emitFile({type: "asset", fileName: filename, source: txt});
            logger.info(`[robots] emitted ${filename}`);
        },

        configureServer(server) {
            const base = (resolvedConfig?.base ?? "/").replace(/\/+$/, "/");
            const route = base + filename;

            server.middlewares.use(route, (_req, res) => {
                const txt = buildTxt();

                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                if (noStoreInDev) {
                    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
                    res.setHeader("Pragma", "no-cache");
                    res.setHeader("Expires", "0");
                }
                res.end(txt);
            });

            logger.info(`[robots] dev route mounted → ${route} (no-store)`);
        },
    };
}

export default generateRobotsTxt;
