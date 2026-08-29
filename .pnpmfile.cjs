// pnpmfile.cjs — hooks to force hono to a patched version
// This works around pnpm v11's failure to apply workspace overrides to
// packages resolved primarily as peer deps (hono@4.12.19 via @modelcontextprotocol/sdk).
// See: pnpm-workspace.yaml overrides section for the declarative attempts.

function readPackage(pkg, context) {
    if (pkg.dependencies && pkg.dependencies["hono"]) {
        const current = pkg.dependencies["hono"];
        if (current !== ">=4.12.34") {
            pkg.dependencies["hono"] = ">=4.12.34";
            context.log(`Patched ${pkg.name}@${pkg.version} hono dep: ${current} → >=4.12.34`);
        }
    }
    if (pkg.peerDependencies && pkg.peerDependencies["hono"]) {
        const current = pkg.peerDependencies["hono"];
        if (current !== ">=4.12.34") {
            pkg.peerDependencies["hono"] = ">=4.12.34";
            context.log(`Patched ${pkg.name}@${pkg.version} hono peerDep: ${current} → >=4.12.34`);
        }
    }
    return pkg;
}

module.exports = {
    hooks: {
        readPackage,
    },
};
