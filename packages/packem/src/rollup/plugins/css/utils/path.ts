import { join } from "@visulima/path";

export const isAbsolutePath = (path: string): boolean => /^(?:\/|(?:[A-Z]:)?[/\\|])/i.test(path);

export const normalizePath = (...paths: string[]): string => {
    const f = join(...paths).replaceAll("\\", "/");

    if (/^\.[/\\]/.test(paths[0] as string)) {
        return `./${f}`;
    }

    return f;
};

