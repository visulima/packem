export const HASH_REGEXP: RegExp = /\[hash(?::(\d+))?\]/;

export const FIRST_EXTENSION_REGEXP: RegExp = /(?<!^|[/\\])(\.[^\s.]+)/;

export const DATA_URI_REGEXP: RegExp = /data:[^\n\r;]+(?:;charset=[^\n\r;]+)?;base64,([\d+/A-Za-z]+={0,2})/;
