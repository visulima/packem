const REGEXP_SPECIAL_CHARACTERS_REGEX = /[.*+?^${}()|[\]\\]/g;

/**
 * Escapes regular-expression metacharacters in a string so it can be safely
 * interpolated into a `RegExp` and matched literally.
 * @param value Raw string (e.g. a user-configured directory name).
 * @returns The string with all regex special characters backslash-escaped.
 */
const escapeRegExp = (value: string): string => value.replace(REGEXP_SPECIAL_CHARACTERS_REGEX, "\\$&");

export default escapeRegExp;
