const ANY_DATA_URL_REGEX = /^data:text\/css(?:;(?:base64|plain))?,/i;
const BASE64_DATA_URL_REGEX = /^data:text\/css;base64,/i;
const PLAIN_DATA_URL_REGEX = /^data:text\/css;plain,/i;

export const isValidDataURL = (url?: string): boolean => url !== undefined && ANY_DATA_URL_REGEX.test(url);

export const dataURLContents = (url: string): string => {
    if (BASE64_DATA_URL_REGEX.test(url)) {
        // "data:text/css;base64,".length === 21
        return Buffer.from(url.slice(21), "base64").toString();
    }

    if (PLAIN_DATA_URL_REGEX.test(url)) {
        // "data:text/css;plain,".length === 20
        return decodeURIComponent(url.slice(20));
    }

    // "data:text/css,".length === 14
    return decodeURIComponent(url.slice(14));
};
