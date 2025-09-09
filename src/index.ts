// src/index.ts
import fs from "node:fs";
import path from "node:path";
import type {Plugin} from "vite";

/** One user-agent block */
export type RobotsPolicy = {
    userAgent?: string;      // default "*"
    allow?: string[];        // lines like "Allow: /"
    disallow?: string[];     // lines like "Disallow: /private"
};

export type RobotsOptions = {
    /** Directory where the file will be written. If omitted: auto-detects "static" (SvelteKit) or "public". */
    outputDir?: string;
    /** Output file name (default: "robots.txt"). */
    filename?: string;

    /** Provide explicit policies (most direct). */
    policies?: RobotsPolicy[];

    /** Or generate policies dynamically (receives Vite context). */
    policyBuilder?: (ctx: {
        mode: string;             // "development" | "production" | custom
        command: "serve" | "build";
        root: string;
    }) => RobotsPolicy[];

    /** Sitemaps: as a list or a builder. */
    sitemaps?:
        | string[]
        | ((ctx: { mode: string; command: "serve" | "build"; root: string }) => string[] | undefined);

    /** Optional comment appended at the end (prefixed with '#'). */
    footerComment?: string | ((ctx: { mode: string; command: "serve" | "build"; root: string }) => string | undefined);

    /** Serve with no-store headers during dev (default: true). */
    noStoreInDev?: boolean;
};

// ----------------- tiny utils (no project-specific dependencies) -----------------

const DEFAULT_FILENAME = "robots.txt";

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
}

function writeFileIfChanged(filePath: string, content: string) {
    ensureDir(path.dirname(filePath));
    const existed = fs.existsSync(filePath);
    const old = existed ? fs.readFileSync(filePath, "utf-8") : null;
    if (!existed || old !== content) {
        fs.writeFileSync(filePath, content, "utf-8");
    }
}

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

    // final newline
    return blocks.join("\n").replace(/\s+$/m, "") + "\n";
}

/** Default policy = allow all (neutral & framework-agnostic). */
function defaultPolicies(): RobotsPolicy[] {
    return [{userAgent: "*", allow: ["/"], disallow: []}];
}

function detectOutputDir(root: string, explicit?: string) {
    if (explicit) return path.resolve(root, explicit);
    const svelteKitStatic = path.resolve(root, "static");
    const genericPublic = path.resolve(root, "public");
    if (fs.existsSync(svelteKitStatic)) return svelteKitStatic; // SvelteKit
    return genericPublic; // React/Vue/others (created if missing)
}

function buildContent(ctx: { mode: string; command: "serve" | "build"; root: string }, opts: RobotsOptions) {
    const policies =
        (opts.policies && opts.policies.length ? opts.policies : undefined) ??
        (opts.policyBuilder ? opts.policyBuilder(ctx) : undefined) ??
        defaultPolicies();

    const head = serializePolicies(policies);

    const sitemaps =
        typeof opts.sitemaps === "function" ? opts.sitemaps(ctx) : Array.isArray(opts.sitemaps) ? opts.sitemaps : undefined;
    const smBlock = sitemaps?.length ? sitemaps.map((u) => `Sitemap: ${u}`).join("\n") + "\n" : "";

    const foot =
        typeof opts.footerComment === "function" ? opts.footerComment(ctx) : opts.footerComment ?? undefined;
    const footerBlock = foot ? `\n# ${foot.trim()}\n` : "";

    return (head + (smBlock ? `\n${smBlock}` : "") + footerBlock).replace(/\n{3,}$/g, "\n\n");
}

// ----------------- Vite plugin -----------------

export function generateRobotsTxt(options: RobotsOptions = {}): Plugin {
    const filename = options.filename ?? DEFAULT_FILENAME;
    const noStoreInDev = options.noStoreInDev ?? true;

    let root = process.cwd();
    let mode = "production";
    let command: "serve" | "build" = "build";
    let outDir = detectOutputDir(root, options.outputDir);
    let outPath = path.join(outDir, filename);

    return {
        name: "vite-plugin-robots-txt",
        apply: () => true,

        configResolved(config) {
            root = config.root ?? process.cwd();
            mode = config.mode;
            command = (config as any).command ?? command;
            outDir = detectOutputDir(root, options.outputDir);
            outPath = path.join(outDir, filename);
        },

        buildStart() {
            const ctx = {mode, command, root};
            const content = buildContent(ctx, options);
            writeFileIfChanged(outPath, content);
        },

        configureServer(server) {
            server.middlewares.use(`/${filename}`, (_req, res) => {
                const ctx = {mode: server.config.mode, command: "serve" as const, root};
                const content = buildContent(ctx, options);

                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                if (noStoreInDev) {
                    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
                    res.setHeader("Pragma", "no-cache");
                    res.setHeader("Expires", "0");
                }
                res.end(content);
            });
        },
    };
}

export default generateRobotsTxt;
