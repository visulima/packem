declare const legacyHelper: () => number;
declare const renamedHelper: () => number;

type LegacyOptions = { a: number };

/** Doc written on the declaration itself. */
type DocumentedOptions = { b: number };

export { DocumentedOptions, legacyHelper, LegacyOptions, renamedHelper };
