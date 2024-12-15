/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, Context, DeclarationReflection, Reflection } from "typedoc";
import { Comment, Converter, IntrinsicType, ReflectionFlag, ReflectionKind, TypeParameterReflection } from "typedoc";

import { getTarget } from "./utils";

/**
 * Handles the `EVENT_END` event of the TypeDoc converter.
 * Processes reflections with the `@eventName` tag and creates event reflections.
 *
 * @param context - The TypeDoc converter context.
 */
const onEventEnd = (context: Context): void => {
    const eventKind = ReflectionKind.ObjectLiteral | ReflectionKind.TypeAlias;
    const reflections = context.project.getReflectionsByKind(eventKind);

    for (const reflection of reflections) {
        if (!reflection.comment?.getTag("@eventName")) {
            continue;
        }

        const eventTags = reflection.comment.getTags("@eventName").map((tag) => tag.content[0].text);

        for (const eventTag of eventTags) {
            const [eventOwner, eventName] = eventTag.split("#");
            const ownerReflection = getTarget(reflection, eventOwner);

            if (!isClassOrInterface(ownerReflection)) {
                const symbol = context.project.getSymbolFromReflection(reflection);
                const node = symbol?.declarations?.[0];
                context.logger.warn(`Skipping unsupported "${eventTag}" event.`, node);
                continue;
            }

            const ownerContext = context.withScope(ownerReflection);
            createNewEventReflection(ownerContext, reflection, eventName);
        }
    }
};

/**
 * Checks if the given reflection is a class or an interface.
 *
 * @param reflection - The reflection to check.
 * @returns `true` if the reflection is a class or interface, otherwise `false`.
 */
const isClassOrInterface = (reflection: Reflection | undefined): boolean =>
    !!reflection && (reflection.kindString === "Class" || reflection.kindString === "Interface");

/**
 * Creates a new reflection for the provided event name in the event owner's scope.
 *
 * @param ownerContext - The context for the event owner.
 * @param reflection - The reflection containing the event.
 * @param eventName - The name of the event.
 */
const createNewEventReflection = (ownerContext: Context, reflection: DeclarationReflection, eventName: string): void => {
    const eventReflection = ownerContext.createDeclarationReflection(ReflectionKind.ObjectLiteral, undefined, undefined, normalizeEventName(eventName));

    eventReflection.kindString = "Event";

    const parameterTags = reflection.comment?.getTags("@param") ?? [];
    const argumentsReflection = getArgumentsTuple(reflection);

    const typeParameters = argumentsReflection.map((argument, index) => {
        const parameterName = argument.element?.name ?? parameterTags[index]?.name ?? "<anonymous>";
        const parameter = new TypeParameterReflection(parameterName, undefined, undefined, eventReflection);

        parameter.type = argument;
        if (parameter.type.isOptional || parameter.type.type === "optional") {
            parameter.setFlag(ReflectionFlag.Optional);
        }

        const comment = parameterTags.find((tag) => tag.name === parameterName);
        if (comment) {
            parameter.comment = new Comment(comment.content);
        }

        return parameter;
    });

    if (typeParameters.length > 0) {
        eventReflection.typeParameters = typeParameters;
    }

    eventReflection.comment = reflection.comment?.clone();
    eventReflection.sources = [...(reflection.sources ?? [])];
};

/**
 * Finds the `args` tuple associated with the event and returns its elements.
 *
 * @param reflection - The reflection containing the event.
 * @returns An array of reflections representing the event parameters.
 */
const getArgumentsTuple = (reflection: DeclarationReflection): Reflection[] => {
    const typeArguments = reflection.type?.typeArguments || [];
    const targetTypeReflections = [...typeArguments.flatMap(getTargetTypeReflections), ...getTargetTypeReflections(reflection.type)];

    const argumentsTuple = targetTypeReflections
        .filter((type) => type.declaration?.children)
        .flatMap((type) => type.declaration!.children)
        .find((property) => property.name === "args");

    if (!argumentsTuple?.type?.elements) {
        return [new IntrinsicType("any")];
    }

    return argumentsTuple.type.elements;
};

/**
 * Recursively retrieves target type reflections for the given type.
 *
 * @param reflectionType - The reflection type to process.
 * @returns An array of target type reflections.
 */
const getTargetTypeReflections = (reflectionType: Reflection | undefined): Reflection[] => {
    if (!reflectionType) {
        return [];
    }

    if (reflectionType.type === "reference" && reflectionType.reflection) {
        return getTargetTypeReflections(reflectionType.reflection.type);
    }

    if (reflectionType.type === "intersection") {
        return reflectionType.types.flatMap(getTargetTypeReflections);
    }

    return [reflectionType];
};

/**
 * Normalizes the event name to ensure it always starts with the "event:" prefix.
 *
 * @param eventName - The event name to normalize.
 * @returns The normalized event name.
 */
const normalizeEventName = (eventName: string): string => (eventName.startsWith("event:") ? eventName : `event:${eventName}`);

/**
 * The `typedoc-plugin-tag-event` collects event definitions from the `@eventName` tag and assigns them as children of the class or the
 * `Observable` interface.
 *
 * Instead of using the `@event` tag (which has a special meaning in TypeDoc), this plugin introduces support for the custom `@eventName`
 * tag to achieve the desired behavior.
 *
 * Correctly defining an event requires associating it with an exported type describing the event, including its `name` and `args`
 * properties.
 *
 * Example:
 *
 * ```ts
 * export class ExampleClass {}
 *
 * export type ExampleType = { name: string };
 *
 * /**
 *  * An event associated with an exported type.
 *  *
 *  * @eventName ~ExampleClass#foo-event
 *  * @param p1 Description for the first parameter.
 *  * @param p2 Description for the second parameter.
 *  * @param p3 Description for the third parameter.
 *  * /
 * export type FooEvent = {
 *     name: string;
 *     args: [
 *         p1: string;
 *         p2: number;
 *         p3: ExampleType;
 *     ];
 * };
 * ```
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_END, onEventEnd);
};
