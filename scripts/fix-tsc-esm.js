#!/usr/bin/env node
// Patch tsc-emitted ESM dist/ files to add explicit `.js` / `/index.js` extensions
// to relative imports so node ESM can resolve them.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const PROCESS_EXTS = new Set([".js", ".mjs", ".cjs"]);

const walk = (dir, files = []) => {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = statSync(p);
        if (st.isDirectory()) {
            walk(p, files);
        } else if (PROCESS_EXTS.has(p.slice(p.lastIndexOf("."))) || p.endsWith(".d.ts")) {
            files.push(p);
        }
    }
    return files;
};

const fixSpec = (spec, fileDir) => {
    if (!spec.startsWith(".")) return spec;
    if (spec.endsWith(".js") || spec.endsWith(".mjs") || spec.endsWith(".cjs") || spec.endsWith(".json")) return spec;

    const target = resolve(fileDir, spec);
    try {
        const st = statSync(target);
        if (st.isDirectory()) return `${spec.replace(/\/$/, "")}/index.js`;
    } catch {
        // not a directory, fall through
    }
    // assume file, add .js
    return `${spec}.js`;
};

const patternSpec = /(['"])(\.[^'"\n]*?)\1/g;

const patchFile = (file) => {
    const dir = dirname(file);
    let src = readFileSync(file, "utf8");
    let changed = false;

    // Match `from "..."`, `import("...")`, `export ... from "..."`, etc.
    const lineRe = /\b(from|import)\s*\(?\s*(['"])(\.[^'"\n]+?)\2/g;
    src = src.replace(lineRe, (m, kw, q, spec) => {
        const fixed = fixSpec(spec, dir);
        if (fixed !== spec) {
            changed = true;
            return `${kw}${m.includes("(") ? "(" : " "}${q}${fixed}${q}`;
        }
        return m;
    });

    if (changed) writeFileSync(file, src);
};

const root = process.argv[2];
if (!root) {
    console.error("usage: fix-tsc-esm.js <dist-dir>");
    process.exit(1);
}

if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`fix-tsc-esm.js: not a directory: ${root}`);
    process.exit(1);
}

for (const file of walk(root)) patchFile(file);
