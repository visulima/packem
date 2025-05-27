export interface BarrelReExport {
    from: "other";
    source: string;
    type: "barrel";
}

export interface ExportBinding {
    exportedName: string;
    importedName: string;
}

export interface NamedReExport {
    bindings: ExportBinding[];
    from: "other";
    source: string;
    type: "named";
}

/**
 * Modified copy of https://github.com/cprecioso/rollup-plugin-chunk-per-export/blob/main/src/parse/types.ts
 */
export interface NamedSelfExport {
    exportedName: string;
    from: "self";
    type: "named";
}

export type ParsedExportInfo = BarrelReExport | NamedReExport | NamedSelfExport;
