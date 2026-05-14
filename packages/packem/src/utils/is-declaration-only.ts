/**
 * Detect entries/chunks that exist only to emit a declaration file.
 * The canonical signal is the source basename ending in `.d` (e.g. `foo.d.ts`),
 * which surfaces in rollup as a chunk name with that same `.d` suffix.
 */
const isDeclarationOnlyName = (name: string | undefined): boolean => Boolean(name?.endsWith(".d"));

export default isDeclarationOnlyName;
