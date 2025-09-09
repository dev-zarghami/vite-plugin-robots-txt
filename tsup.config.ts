import {defineConfig} from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
    treeshake: true,
    outDir: "dist",
    env: {NODE_ENV: "production"},
    // keep named exports predictable across ESM/CJS
    cjsInterop: true,
    // don’t bundle node builtins
    noExternal: ["vite"],
});
