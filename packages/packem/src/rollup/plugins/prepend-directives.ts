import type { Plugin } from "rollup";

const prependDirectivePlugin = (): Plugin => {
    return {
        name: "packem:prepend-directive",
        transform: {
            handler(code, id) {
                const moduleInfo = this.getModuleInfo(id);

                if (moduleInfo?.meta.preserveDirectives) {
                    const firstDirective = moduleInfo.meta.preserveDirectives.directives[0];

                    if (firstDirective) {
                        const directive = firstDirective.value;
                        const directiveCode = `'${directive as string}';`;

                        return directiveCode + "\n" + code;
                    }
                }

                return null;
            },
            order: "post",
        },
    };
};

export default prependDirectivePlugin;
