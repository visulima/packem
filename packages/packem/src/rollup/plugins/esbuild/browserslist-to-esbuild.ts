const SUPPORTED_ESBUILD_TARGETS = new Set(["es", "chrome", "edge", "firefox", "ios", "node", "safari", "opera", "ie"]);

// https://github.com/eBay/browserslist-config/issues/16#issuecomment-863870093
const UNSUPPORTED = ["android 4"];

const replaces = {
    android: "chrome",
    ios_saf: "ios",
};

const separator = " ";

const browserslistToEsbuild = (browserList: string[]): string[] => {
    let listOfBrowsers = browserList
        // filter out the unsupported ones
        .filter((browser) => !UNSUPPORTED.some((unsupportedBrowser) => browser.startsWith(unsupportedBrowser)))
        // transform into ['chrome', '88']
        .map((browser) => browser.split(separator))
        // replace the similar browser
        .map(([browserName, version]) => [replaces[browserName as keyof typeof replaces] || browserName, version])
        // 11.0-12.0 --> 11.0
        .map(([browserName, version]) => [
            browserName,
            (version as string).includes("-") ? (version as string).slice(0, (version as string).indexOf("-")) : version,
        ])
        // 11.0 --> 11
        .map(([browserName, version]) => [browserName, (version as string).endsWith(".0") ? (version as string).slice(0, -2) : version])
        // removes invalid versions that will break esbuild
        // eslint-disable-next-line no-secrets/no-secrets
        // https://github.com/evanw/esbuild/blob/35c0d65b9d4f29a26176404d2890d1b499634e9f/compat-table/src/caniuse.ts#L119-L122
        .filter(([, version]) => /^\d+(\.\d+)*$/.test(version as string))
        // only get the targets supported by esbuild
        .filter(([browserName]) => SUPPORTED_ESBUILD_TARGETS.has(browserName as string));

    // only get the oldest version, assuming that the older version is the last one in the array:
    listOfBrowsers = Object.entries(Object.fromEntries(listOfBrowsers));

    return listOfBrowsers.map(([browserName, version]) => `${browserName}${version}`);
};

export default browserslistToEsbuild;
