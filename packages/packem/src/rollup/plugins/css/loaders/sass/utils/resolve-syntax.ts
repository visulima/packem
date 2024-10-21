const resolveSyntax = (extension: string): "scss" | "indented" | "css" | undefined => {
    switch (extension.toLowerCase()) {
        case ".scss": {
            return "scss";
        }
        case ".sass": {
            return "indented";
        }
        case ".css": {
            return "css";
        }
        default: {
            return undefined;
        }
    }
};

export default resolveSyntax;
