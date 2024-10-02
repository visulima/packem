// eslint-disable-next-line security/detect-unsafe-regex,@typescript-eslint/no-inferrable-types
export const hashRe: RegExp = /\[hash(?::(\d+))?\]/;
// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const firstExtRe: RegExp = /(?<!^|[/\\])(\.[^\s.]+)/;
// eslint-disable-next-line security/detect-unsafe-regex,@typescript-eslint/no-inferrable-types
export const dataURIRe: RegExp = /data:[^\n\r;]+(?:;charset=[^\n\r;]+)?;base64,([\d+/A-Za-z]+={0,2})/;
