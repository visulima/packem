// eslint-disable-next-line security/detect-unsafe-regex,@typescript-eslint/no-inferrable-types
export const HASH_REGEXP: RegExp = /\[hash(?::(\d+))?\]/;
// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const FIRST_EXTENSION_REGEXP: RegExp = /(?<!^|[/\\])(\.[^\s.]+)/;
// eslint-disable-next-line security/detect-unsafe-regex,@typescript-eslint/no-inferrable-types
export const DATA_URI_REGEXP: RegExp = /data:[^\n\r;]+(?:;charset=[^\n\r;]+)?;base64,([\d+/A-Za-z]+={0,2})/;
