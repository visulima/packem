/**
 * Minimal ambient declarations for the `WebAssembly` global.
 *
 * The real ones live in `lib.dom.d.ts`, which this package deliberately does not pull in
 * (its `lib` is `ES2023`), and `@types/node` does not declare them either. The wasm tests
 * compile and instantiate real modules to check the reader and the generated wrappers
 * against the engine, so they need just enough of the surface to do that.
 */
declare namespace WebAssembly {
    interface ModuleExportDescriptor {
        kind: string;
        name: string;
    }

    interface ModuleImportDescriptor {
        kind: string;
        module: string;
        name: string;
    }

    interface Module {
        readonly __brand: "WebAssembly.Module";
    }

    interface Instance {
        readonly exports: Record<string, unknown>;
    }

    interface Memory {
        readonly buffer: ArrayBuffer;
    }

    type Imports = Record<string, Record<string, unknown>>;

    const Module: {
        exports: (module: Module) => ModuleExportDescriptor[];
        imports: (module: Module) => ModuleImportDescriptor[];
        new (bytes: Uint8Array): Module;
        prototype: Module;
    };

    const Instance: {
        new (module: Module, imports?: Imports): Instance;
        prototype: Instance;
    };

    const Memory: {
        prototype: Memory;
    };
}
