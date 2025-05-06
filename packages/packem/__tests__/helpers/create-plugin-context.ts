import type { InputOptions, NormalizedInputOptions, NullValue, Plugin, PluginContextMeta, ResolveIdResult, RollupError } from "rollup";

class MockPluginContext {
    public readonly warnings: string[];

    public readonly meta: PluginContextMeta;

    private readonly oPlugin: Plugin;

    public constructor(oPlugin: Plugin) {
        this.oPlugin = oPlugin;
        this.warnings = [];

        this.meta = {
            rollupVersion: "*",
            watchMode: false,
        };
    }

    public options(option: InputOptions): InputOptions | NullValue {
        const { options } = this.oPlugin;

        if (typeof options === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return options.call(this as any, option) as InputOptions | NullValue;
        }

        throw new Error("Ooops");
    }

    public async buildStart(): Promise<void> {
        let { buildStart } = this.oPlugin;

        if (typeof buildStart === "object") {
            buildStart = buildStart.handler;
        }

        if (typeof buildStart === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await buildStart.call(this as any, {} as NormalizedInputOptions);

            return;
        }

        throw new Error("Ooops");
    }

    public async resolveId(specifier: string, importer: string | undefined): Promise<ResolveIdResult> {
        let { resolveId } = this.oPlugin;

        if (typeof resolveId === "object") {
            resolveId = resolveId.handler;
        }

        if (typeof resolveId === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return await resolveId.call(this as any, specifier, importer, {
                attributes: {},
                isEntry: typeof importer !== "string",
            });
        }

        throw new Error("Ooops");
    }

    // eslint-disable-next-line class-methods-use-this
    public error(error: string | RollupError): never {
        const message: string = typeof error === "string" ? error : error.message;

        throw new Error(message);
    }

    public warn(message: string): void {
        this.warnings.push(message);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,class-methods-use-this,@typescript-eslint/no-unused-vars
    public addWatchFile(_: string) {
        // nop
    }
}

export default MockPluginContext;
