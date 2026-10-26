// This tool is used by the pr ci to determine the packages that need to be published to the pkg-pr-new registry.

// @ts-check
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/naming-convention,no-underscore-dangle
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(__dirname, "..");

// Call the vis binary directly instead of through `pnpm exec`: pnpm prepends a
// workspace banner and a deps-verification/prepare prelude to stdout, which
// corrupts the list parsed below. vis resolves the affected base from the
// GitHub event and prints one affected project root per line.
const output = execFileSync(join(rootDirectory, "node_modules", ".bin", "vis"), ["affected", "build", "--sparse-checkout", "--query", "tag=type:package"], {
    encoding: "utf8",
});

// Only `packages/*` carry the type:package tag, so these are exactly the publishable roots.
const packages = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((projectRoot) => join(rootDirectory, projectRoot));

if (packages.length > 0) {
    execFileSync("pnpm", ["exec", "pkg-pr-new", "publish", "--comment=update", "--pnpm", ...packages], { stdio: "inherit" });
} else {
    console.log("No packages to publish");
}
