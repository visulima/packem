import jiti from "jiti";

const tryResolve = (id: string, rootDirectory: string): string => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const _require = jiti(rootDirectory, { esmResolve: true, interopDefault: true });

    try {
        return _require.resolve(id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (error.code !== "MODULE_NOT_FOUND") {
            throw new Error(`Error trying import ${id} from ${rootDirectory}`, {
                cause: error,
            });
        }

        return id;
    }
};

export default tryResolve;
