const SUPPORTED_ESBUILD_TARGETS = new Set(["chrome", "edge", "es", "firefox", "ie", "ios", "node", "opera", "safari"]);

// https://github.com/eBay/browserslist-config/issues/16#issuecomment-863870093
const UNSUPPORTED = ["android 4"];

const replaces = {
    android: "chrome",
    ios_saf: "ios",
};

const separator = " ";

const VALID_VERSION_RE = /^\d+(?:\.\d+)*$/;

const browserslistToEsbuild = (browserList: string[]): string[] => {
    let listOfBrowsers: [string, string][] = browserList
        // filter out the unsupported ones
        .filter((browser) => !UNSUPPORTED.some((unsupportedBrowser) => browser.startsWith(unsupportedBrowser)))
        // transform into ['chrome', '88']
        .map((browser): [string, string] => {
            const parts = browser.split(separator);

            return [parts[0] ?? "", parts[1] ?? ""];
        })
        // replace the similar browser
        .map(([browserName, version]): [string, string] => [
            Object.hasOwn(replaces, browserName) ? replaces[browserName as keyof typeof replaces] : browserName,
            version,
        ])
        // 11.0-12.0 --> 11.0
        .map(([browserName, version]): [string, string] => [browserName, version.includes("-") ? version.slice(0, version.indexOf("-")) : version])
        // 11.0 --> 11
        .map(([browserName, version]): [string, string] => [browserName, version.endsWith(".0") ? version.slice(0, -2) : version])
        // removes invalid versions that will break esbuild
        // eslint-disable-next-line no-secrets/no-secrets
        // https://github.com/evanw/esbuild/blob/35c0d65b9d4f29a26176404d2890d1b499634e9f/compat-table/src/caniuse.ts#L119-L122
        .filter(([, version]) => VALID_VERSION_RE.test(version))
        // only get the targets supported by esbuild
        .filter(([browserName]) => SUPPORTED_ESBUILD_TARGETS.has(browserName));

    // only get the oldest version, assuming that the older version is the last one in the array:
    listOfBrowsers = Object.entries(Object.fromEntries(listOfBrowsers));

    return listOfBrowsers.map(([browserName, version]) => `${browserName}${version}`);
};

export default browserslistToEsbuild;
