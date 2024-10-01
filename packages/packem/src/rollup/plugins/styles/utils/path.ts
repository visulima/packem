import { join, relative, resolve } from "@visulima/path";

export const isAbsolutePath = (path: string): boolean => /^(?:\/|(?:[A-Z]:)?[/\\|])/i.test(path);

export const isRelativePath = (path: string): boolean => /^\.?\.[/\\]/.test(path);

export const normalizePath = (...paths: string[]): string => {
    const f = join(...paths).replaceAll("\\", "/");

    if (/^\.[/\\]/.test(paths[0] as string)) {
        return `./${f}`;
    }

    return f;
};

export const resolvePath = (...paths: string[]): string => normalizePath(resolve(...paths));

export const relativePath = (from: string, to: string): string => normalizePath(relative(from, to));

export const humanlizePath = (file: string): string => relativePath(process.cwd(), file);
