import { normalize } from "@visulima/path";

const getEntrypointPaths = (path: string): string[] => {
    const segments = normalize(path).split("/");

    return segments.map((_, index) => segments.slice(index).join("/")).filter(Boolean);
};

export default getEntrypointPaths;
