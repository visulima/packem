import { createHash } from "node:crypto";

/**
 * Internal-only hash for cache keys (file-cache subdirectory names, cache-plugin
 * load/transform/resolveId keys). Uses SHA-1 + base64url because cache keys are:
 *   - never user-visible (unlike `getHash`, which feeds CSS module class names
 *     and asset URL fingerprints — those must stay SHA-256/hex);
 *   - dominated by per-call setup cost on short inputs (id strings,
 *     stringified options), where SHA-1 outperforms SHA-256 by ~30-50%;
 *   - paired with at least one other key component (path prefix, content hash),
 *     so SHA-1's collision resistance is more than enough for a per-build cache.
 *
 * `base64url` (~27 chars) replaces `hex` (40 chars) to shave filename length
 * and downstream string-concat / join cost in cache-plugin's hot path.
 */
const getCacheHash = (data: NodeJS.ArrayBufferView | string): string => createHash("sha1").update(data).digest("base64url");

export default getCacheHash;
