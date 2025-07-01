const resolveSyntax = (extension: string): "css" | "indented" | "scss" | undefined => {
    switch (extension.toLowerCase()) {
        case ".css": {
            return "css";
        }
        case ".sass": {
            return "indented";
        }
        case ".scss": {
            return "scss";
        }
        default: {
            return undefined;
        }
    }
};

export default resolveSyntax;
