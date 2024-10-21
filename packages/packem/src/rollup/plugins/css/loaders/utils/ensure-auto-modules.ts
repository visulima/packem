import type { AutoModules } from "../../types";

// eslint-disable-next-line no-secrets/no-secrets
// https://github.com/vitejs/vite/blob/37af8a7be417f1fb2cf9a0d5e9ad90b76ff211b4/packages/vite/src/node/plugins/css.ts#L185
// eslint-disable-next-line regexp/no-unused-capturing-group
const MODULE_FILE_PATTERN = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

const ensureAutoModules = (am: AutoModules | undefined, id: string): boolean => {
    if (am === undefined) {
        return true;
    }

    if (typeof am === "function") {
        return am(id);
    }

    if (am instanceof RegExp) {
        return am.test(id);
    }

    return am && MODULE_FILE_PATTERN.test(id);
};

export default ensureAutoModules;
