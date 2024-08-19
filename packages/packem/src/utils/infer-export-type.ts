export const inferExportTypeFromFileName = (filename: string): "cjs" | "esm" | undefined => {
    if (filename.endsWith(".mjs") || filename.endsWith(".d.mts")) {
        return "esm";
    }

    if (filename.endsWith(".cjs") || filename.endsWith(".d.cts")) {
        return "cjs";
    }

    return undefined;
};

export const inferExportType = (condition: string, previousConditions: string[], packageType: "cjs" | "esm", filename?: string): "cjs" | "esm" => {
    if (filename) {
        const inferredType = inferExportTypeFromFileName(filename);

        if (inferredType) {
            return inferredType;
        }
    }

    // Defacto module entry-point for bundlers (not Node.js)
    if (condition === "module") {
        return "esm";
    }

    if (condition === "import") {
        return "esm";
    }

    if (condition === "require") {
        return "cjs";
    }

    if (previousConditions.length === 0) {
        return packageType;
    }

    const [newCondition, ...rest] = previousConditions;

    return inferExportType(newCondition as string, rest, packageType, filename);
};