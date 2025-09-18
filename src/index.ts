// vite/plugins/generate-robots.ts
import type {Plugin, ResolvedConfig} from "vite";

/** One user-agent block */
export type RobotsPolicy = {
    userAgent?: string;   // default "*"
    allow?: string[];
    disallow?: string[];
};

export type RobotsOptions = {
    filename?: string; // default "robots.txt"
    policies?: RobotsPolicy[];
    policyBuilder?: (ctx: {
        mode: string;
        command: "serve" | "build";
        root: string;
    }) => RobotsPolicy[];

    sitemaps?:
        | string[]
        | ((ctx: { mode: string; command: "serve" | "build"; root: string }) =>
        | string[]
        | undefined);

    footerComment?:
        | string
        | ((ctx: { mode: string; command: "serve" | "build"; root: string }) =>
        | string
        | undefined);

    noStoreInDev?: boolean; // default true
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
    opts: RobotsOptions,
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
    const smBlock = sitemaps?.length
        ? sitemaps.map((u) => `Sitemap: ${u}`).join("\n") + "\n"
        : "";

    const foot =
        typeof opts.footerComment === "function"
            ? opts.footerComment(ctx)
            : opts.footerComment ?? undefined;
    const footerBlock = foot ? `\n# ${foot.trim()}\n` : "";

    return (head + (smBlock ? `\n${smBlock}` : "") + footerBlock).replace(
        /\n{3,}$/g,
        "\n\n",
    );
}

// ----------------- Vite plugin -----------------

export function generateRobotsTxt(options: RobotsOptions = {}): Plugin {
    const filename = options.filename ?? DEFAULT_FILENAME;
    const noStoreInDev = options.noStoreInDev ?? true;

    let resolvedConfig: ResolvedConfig;
    let mode = "production";
    let command: "serve" | "build" = "build";
    let root = process.cwd();
    let lastTxt = "";

    const buildTxt = () => {
        const ctx = {mode, command, root};
        const txt = buildContent(ctx, options);
        lastTxt = txt;
        return txt;
    };

    return {
        name: "vite-plugin-robots-txt",
        apply: () => true,

        configResolved(config) {
            resolvedConfig = config;
            root = config.root ?? process.cwd();
            mode = config.mode;
            command = config.command as "serve" | "build";
        },

        buildStart() {
            buildTxt(); // generate initial version for dev & virtual usage
        },

        generateBundle() {
            const txt = buildTxt();
            this.emitFile({
                type: "asset",
                fileName: filename, // robots.txt in build output root
                source: txt,
            });
        },

        configureServer(server) {
            const base = (resolvedConfig?.base ?? "/").replace(/\/+$/, "/");
            const route = base + filename;

            server.middlewares.use(route, (_req, res) => {
                const txt = buildTxt();

                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                if (noStoreInDev) {
                    res.setHeader(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate, max-age=0",
                    );
                    res.setHeader("Pragma", "no-cache");
                    res.setHeader("Expires", "0");
                }
                res.end(txt);
            });
        },
    };
}

export default generateRobotsTxt;
