/**
 * Modified copy of https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-bundler/src/postcss-import/lib/parse-at-import.ts
 *
 * MIT No Attribution (MIT-0)
 * Copyright © CSSTools Contributors
 */
import type { ComponentValue } from "@csstools/css-parser-algorithms";
import {
    isFunctionNode,
    isSimpleBlockNode,
    isTokenNode,
    isWhiteSpaceOrCommentNode,
    parseListOfComponentValues,
    SimpleBlockNode,
    stringify,
} from "@csstools/css-parser-algorithms";
import { isTokenIdent, isTokenOpenParen, isTokenString, isTokenURL, tokenize, TokenType } from "@csstools/css-tokenizer";

import { IS_LAYER_REGEX, IS_SCOPE_REGEX, IS_SUPPORTS_REGEX, IS_URL_REGEX } from "../constants";

const wrapInParenthesisIfNeeded = (componentValues: ComponentValue[]): ComponentValue[] => {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of,no-plusplus
    for (let index = 0; index < componentValues.length; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const componentValue = componentValues[index];

        if (isWhiteSpaceOrCommentNode(componentValue)) {
            // eslint-disable-next-line no-continue
            continue;
        }

        if (isSimpleBlockNode(componentValue) && isTokenOpenParen(componentValue.startToken)) {
            return componentValues;
        }
    }

    return [new SimpleBlockNode([TokenType.OpenParen, "(", -1, -1, undefined], [TokenType.CloseParen, ")", -1, -1, undefined], componentValues)];
};

const stripHash = (string_: string): string => {
    if (string_.startsWith("#")) {
        return "";
    }
    if (!string_.includes("#")) {
        return string_;
    }

    try {
        const url = new URL(string_, "http://example.com");
        if (!url.hash) {
            return string_;
        }

        return string_.slice(0, string_.length - url.hash.length);
    } catch {
        return string_;
    }
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const parseAtImport = (parameters: string): false | { fullUri: string; layer?: string; media?: string; scope?: string; supports?: string; uri: string } => {
    const tokens = tokenize({ css: parameters });

    // Fast path for common cases:
    if (tokens.length === 2 && (isTokenString(tokens[0]) || isTokenURL(tokens[0]))) {
        let uri = tokens[0][4].value;
        uri = stripHash(uri);
        if (!uri) {
            return false;
        }

        return {
            fullUri: tokens[0][1],
            uri,
        };
    }

    const componentValues = parseListOfComponentValues(tokens);

    let uri = "";
    let fullUri = "";
    let layer: string | undefined;
    let media: string | undefined;
    let supports: string | undefined;
    let scope: string | undefined;

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < componentValues.length; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const componentValue = componentValues[index];

        if (isWhiteSpaceOrCommentNode(componentValue)) {
            // eslint-disable-next-line no-continue
            continue;
        }

        if (isTokenNode(componentValue) && (isTokenString(componentValue.value) || isTokenURL(componentValue.value))) {
            if (uri) {
                return false;
            }

            uri = componentValue.value[4].value;
            // eslint-disable-next-line prefer-destructuring
            fullUri = componentValue.value[1];
            // eslint-disable-next-line no-continue
            continue;
        }

        if (isFunctionNode(componentValue) && IS_URL_REGEX.test(componentValue.getName())) {
            if (uri) {
                return false;
            }

            // eslint-disable-next-line @typescript-eslint/prefer-for-of,no-plusplus
            for (let cVIndex = 0; cVIndex < componentValue.value.length; cVIndex++) {
                // eslint-disable-next-line security/detect-object-injection
                const childComponentValue = componentValue.value[cVIndex];
                if (isWhiteSpaceOrCommentNode(childComponentValue)) {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                if (!uri && isTokenNode(childComponentValue) && isTokenString(childComponentValue.value)) {
                    uri = childComponentValue.value[4].value;
                    fullUri = stringify([[componentValue]]);
                    // eslint-disable-next-line no-continue
                    continue;
                }

                return false;
            }

            // eslint-disable-next-line no-continue
            continue;
        }

        if (!uri) {
            return false;
        }

        if (isTokenNode(componentValue) && isTokenIdent(componentValue.value) && IS_LAYER_REGEX.test(componentValue.value[4].value)) {
            if (layer !== undefined || supports !== undefined) {
                return false;
            }

            layer = "";
            // eslint-disable-next-line no-continue
            continue;
        }

        if (isFunctionNode(componentValue) && IS_LAYER_REGEX.test(componentValue.getName())) {
            if (layer !== undefined || supports !== undefined) {
                return false;
            }

            layer = stringify([componentValue.value]);
            // eslint-disable-next-line no-continue
            continue;
        }

        if (isFunctionNode(componentValue) && IS_SUPPORTS_REGEX.test(componentValue.getName())) {
            if (supports !== undefined) {
                return false;
            }

            supports = stringify([componentValue.value]);
            // eslint-disable-next-line no-continue
            continue;
        }

        if (isFunctionNode(componentValue) && IS_SCOPE_REGEX.test(componentValue.getName())) {
            if (scope !== undefined) {
                return false;
            }

            scope = stringify([wrapInParenthesisIfNeeded(componentValue.value)]);
            // eslint-disable-next-line no-continue
            continue;
        }

        media = stringify([componentValues.slice(index)]);
        break;
    }

    uri = stripHash(uri);

    if (!uri) {
        return false;
    }

    return {
        fullUri,
        layer,
        media,
        scope,
        supports,
        uri,
    };
};

export default parseAtImport;
