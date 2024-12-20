/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, Context, DeclarationReflection } from "typedoc";
import { Comment, Converter, IntrinsicType, ReflectionKind, TypeParameterReflection, TypeScript } from "typedoc";

/**
 * Handles the `EVENT_END` event of the TypeDoc converter.
 * Searches for `@observable` tags and creates related event reflections.
 *
 * @param context - The TypeDoc converter context.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
const onEventEnd = (context: Context): void => {
    const kinds = ReflectionKind.Property | ReflectionKind.GetSignature | ReflectionKind.SetSignature;
    const reflections = context.project.getReflectionsByKind(kinds);

    for (const reflection of reflections) {
        if (!reflection.comment?.getTag("@observable")) {
            continue;
        }

        const propertyName = reflection.name;
        const classReflection = reflection.kindString === "Property" ? reflection.parent : reflection.parent?.parent;

        if (!classReflection) {
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const eventName of ["change", "set"]) {
            const eventReflection = context
                .withScope(classReflection)
                .createDeclarationReflection(ReflectionKind.ObjectLiteral, undefined, undefined, `event:${eventName}:${propertyName}`) as DeclarationReflection;

            eventReflection.kindString = "Event";

            const nameParameter = typeParameterFactory(context, {
                comment: `Name of the changed property (\`${propertyName}\`).`,
                kind: TypeScript.SyntaxKind.StringKeyword,
                name: "name",
                parent: eventReflection,
            });

            const valueParameter = typeParameterFactory(context, {
                comment: `New value of the \`${propertyName}\` property or \`null\` if the property is removed.`,
                name: "value",
                parent: eventReflection,
                type: reflection.type || new IntrinsicType("any"),
            });

            const oldValueParameter = typeParameterFactory(context, {
                comment: `Old value of the \`${propertyName}\` property or \`null\` if the property was not set before.`,
                name: "oldValue",
                parent: eventReflection,
                type: reflection.type || new IntrinsicType("any"),
            });

            eventReflection.typeParameters = [nameParameter, valueParameter, oldValueParameter];

            eventReflection.comment = new Comment([
                {
                    kind: "text",
                    text:
                        eventName === "change"
                            ? `Fired when the \`${propertyName}\` property changes value.`
                            : `Fired when the \`${propertyName}\` property is about to be set (before the \`change\` event).`,
                },
            ]);

            if (reflection.inheritedFrom) {
                eventReflection.inheritedFrom = reflection.inheritedFrom;
            }

            eventReflection.sources = [...(reflection.sources || [])];
        }
    }
};

/**
 * Creates and returns a new type parameter reflection.
 *
 * @param context - The current state of the converter.
 * @param options - The options for creating the parameter.
 * @param options.name - The name of the parameter.
 * @param options.parent - The parent reflection where the parameter belongs.
 * @param options.kind - The TypeScript kind of the parameter.
 * @param options.comment - A comment describing the parameter.
 * @param options.type - The type of the parameter (optional).
 * @returns A new `TypeParameterReflection` instance.
 */
const typeParameterFactory = (
    context: Context,
    options: {
        comment: string;
        kind?: TypeScript.SyntaxKind;
        name: string;
        parent: DeclarationReflection;
        type?: IntrinsicType;
    },
): TypeParameterReflection => {
    const typeParameter = new TypeParameterReflection(options.name, undefined, undefined, options.parent);

    if (options.type) {
        typeParameter.type = options.type;
    } else if (options.kind) {
        const scope = context.withScope(typeParameter);
        const type = { kind: options.kind };

        typeParameter.type = context.converter.convertType(scope, type);
    }

    typeParameter.comment = new Comment([
        {
            kind: "text",
            text: options.comment,
        },
    ]);

    return typeParameter;
};

/**
 * The `typedoc-plugin-tag-observable` handles the `@observable` tag assigned to a class property. When found, it creates two new events
 * (`change:{property}` and `set:{property}`) and adds them as children of the class or `Observable` interface.
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_END, onEventEnd);
};
