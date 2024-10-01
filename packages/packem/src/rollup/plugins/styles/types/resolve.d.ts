declare module "resolve/async" {
    interface AsyncOptions {
        basedir?: string;
        extensions?: string[];
        moduleDirectory?: string[];
        packageFilter?: (package_: any, packageFile: string) => any;
        pathFilter?: (package_: any, path: string, relativePath: string) => string;
        paths?: string[];
        preserveSymlinks?: boolean;
    }

    type Callback = (error: Error | null, resolved?: string) => void;

    function resolve(id: string, options: AsyncOptions, callback: Callback): void;

    export = resolve;
}

declare module "resolve/sync" {
    interface SyncOptions {
        basedir?: string;
        extensions?: string[];
        moduleDirectory?: string[];
        packageFilter?: (package_: any, packageFile: string) => any;
        pathFilter?: (package_: any, path: string, relativePath: string) => string;
        paths?: string[];
        preserveSymlinks?: boolean;
    }

    function resolve(id: string, options: SyncOptions): string;

    export = resolve;
}
