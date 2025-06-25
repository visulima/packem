const formatImportPrelude = (layer: string | undefined, media: string | undefined, supports: string | undefined, scope: string | undefined): string => {
    const parts = [];

    if (layer !== undefined) {
        let layerParameters = "layer";

        if (layer) {
            layerParameters = `layer(${layer})`;
        }

        parts.push(layerParameters);
    }

    if (supports !== undefined) {
        parts.push(`supports(${supports})`);
    }

    if (scope !== undefined) {
        parts.push(`scope(${scope})`);
    }

    if (media !== undefined) {
        parts.push(media);
    }

    return parts.join(" ");
};

export default formatImportPrelude;
