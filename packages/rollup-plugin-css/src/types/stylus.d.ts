declare namespace stylus {
    type Callback = (error: Error, css: string) => void;

    interface SourceMapOptions {
        basePath?: string;
        comment?: boolean;
        inline?: boolean;
        sourceRoot?: string;
    }

    interface PublicOptions {
        imports?: string[];
        paths?: string[];
    }

    interface Options extends PublicOptions {
        filename?: string;
        sourcemap?: SourceMapOptions;
    }

    type StylusPlugin = (renderer: Renderer) => void;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type DefineValue = any;

    interface Renderer {
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        define(name: string, value: DefineValue, raw?: boolean): this;
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        deps(): string[];
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        import(file: string): this;
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        include(path: string): this;
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        render(callback: Callback): void;
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        set<T extends keyof Options>(key: T, value: Options[T]): this;
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        set(key: string, value: unknown): this;
        sourcemap?: {
            file: string;
            mappings: string;
            names: string[];
            sourceRoot?: string;
            sources: string[];
            sourcesContent?: string[];
            version: number;
        };
        // eslint-disable-next-line @typescript-eslint/method-signature-style
        use(plugin: StylusPlugin): this;
    }

    type Stylus = (code: string, options?: Options) => Renderer;
}
