/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { DeclarationReflection, Reflection } from "typedoc";
import { ReflectionKind } from "typedoc";

/**
 * Checks if the reflection can be considered as "valid" (supported).
 * Only reflections that are not nested inside a type are supported.
 *
 * @param reflection - The reflection to check.
 * @returns `true` if the reflection is valid, otherwise `false`.
 */
export const isReflectionValid = (reflection: Reflection): boolean => {
    if (reflection.name === "__type") {
        return false;
    }

    if (reflection.parent) {
        return isReflectionValid(reflection.parent);
    }

    return true;
};

/**
 * Checks if the name (identifier) provided for a tag points to an existing reflection in the project.
 * The identifier can be either relative or absolute.
 *
 * @param reflection - The reflection that contains the identifier.
 * @param identifier - The identifier to check.
 * @returns `true` if the identifier is valid, otherwise `false`.
 */
export const isIdentifierValid = (reflection: Reflection, identifier: string): boolean => {
    if (reflection.inheritedFrom) {
        return true;
    }

    return !!getTarget(reflection, identifier);
};

/**
 * Checks if the identifier is absolute.
 *
 * @param identifier - The identifier to check.
 * @returns `true` if the identifier is absolute, otherwise `false`.
 */
export const isAbsoluteIdentifier = (identifier: string): boolean => identifier.startsWith("module:");

/**
 * Converts a relative identifier into an absolute one.
 *
 * @param reflection - The reflection that contains the identifier.
 * @param identifier - The identifier to convert.
 * @returns The absolute identifier.
 */
export const toAbsoluteIdentifier = (reflection: Reflection, identifier: string): string => {
    const separator = identifier[0];
    const parts = getLongNameParts(reflection);

    return separator === "~" ? `module:${parts[0]}${identifier}` : `module:${parts[0]}~${parts[1]}${identifier}`;
};

/**
 * Returns a long name for a reflection, divided into separate parts.
 *
 * @param reflection - The reflection to process.
 * @returns An array of strings representing the long name parts.
 */
export const getLongNameParts = (reflection: Reflection): string[] => {
    const validKinds = new Set(["Module", "Class", "Function", "Interface", "Type alias", "Accessor", "Variable", "Method", "Property", "Event"]);

    const parts: string[] = [];

    while (reflection) {
        if (validKinds.has(reflection.kindString || "")) {
            parts.unshift(reflection.name);
        }
        reflection = reflection.parent!;
    }

    return parts;
};

/**
 * Returns the TypeScript node from the reflection.
 *
 * @param reflection - The reflection to process.
 * @returns The TypeScript node or `null` if not found.
 */
export const getNode = (reflection: Reflection): ts.Node | null => {
    let symbol = reflection.project.getSymbolFromReflection(reflection);
    let declarationIndex = 0;

    if (!symbol) {
        symbol = reflection.project.getSymbolFromReflection(reflection.parent!);
        declarationIndex = reflection.parent?.signatures?.indexOf(reflection as DeclarationReflection) || 0;
    }

    if (!symbol) {
        return null;
    }

    return symbol.declarations?.[declarationIndex] || null;
};

/**
 * Checks if the provided identifier targets an existing reflection within the project
 * and returns the found reflection. Returns `null` if not found.
 *
 * @param reflection - The reflection that contains the identifier.
 * @param identifier - The identifier to locate the target reflection.
 * @returns The target reflection or `null`.
 */
export const getTarget = (reflection: Reflection, identifier: string): Reflection | null => {
    if (!identifier) {
        return null;
    }

    const absoluteIdentifier = isAbsoluteIdentifier(identifier) ? identifier : toAbsoluteIdentifier(reflection, identifier);

    const parts = absoluteIdentifier.slice("module:".length).split(/[#~.]/);

    const lastPart = parts.pop()!;
    const [lastPartName, lastPartLabel] = lastPart.split(":");
    const isEvent = lastPart.startsWith("event:");
    const isLabeledSignature = !isEvent && lastPart.includes(":");

    if (isLabeledSignature) {
        parts.push(lastPartName);
    } else {
        parts.push(lastPart);
    }

    const targetReflection = reflection.project.getChildByName(parts);

    if (!targetReflection) {
        const partsWithoutLast = parts.slice(0, -1);
        const typeReflection = reflection.project.getChildByName(partsWithoutLast);

        if (!typeReflection || typeReflection.kind !== ReflectionKind.TypeAlias) {
            return null;
        }

        const [identifierName] = parts.slice(-1);
        return typeReflection.type?.declaration?.children?.find((child) => child.name === identifierName) || null;
    }

    if (isLabeledSignature) {
        if (!targetReflection.signatures) {
            return null;
        }

        return (
            targetReflection.signatures.find((signature) => {
                const labelTag = signature.comment?.getTag("@label");
                return labelTag?.content[0]?.text === lastPartLabel;
            }) || null
        );
    }

    const isStatic = absoluteIdentifier.includes(".");
    const isTargetStatic = !!targetReflection.flags?.isStatic;

    if (isStatic !== isTargetStatic) {
        return null;
    }

    return targetReflection;
};
