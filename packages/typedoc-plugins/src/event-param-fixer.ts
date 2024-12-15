/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, Context } from "typedoc";
import { Comment, Converter, DeclarationReflection, ProjectReflection, ReferenceType, ReflectionKind, TypeParameterReflection } from "typedoc";

/**
 * Handles the `EVENT_END` event of the TypeDoc converter.
 * Adds an `eventInfo` parameter to all reflections of kind `Event`.
 *
 * @param context - The TypeDoc converter context.
 */
const onEventEnd = (context: Context): void => {
    // Try to find the `EventInfo` class from the `utils/eventinfo` module.
    const eventInfoClass = context.project.getChildByName(["utils/eventinfo", "EventInfo"]);

    if (!eventInfoClass) {
        context.logger.warn('Unable to find the "EventInfo" class.');
        return;
    }

    // Get the reference to the `EventInfo` class. The reference is constant, it is the same in the whole project.
    const eventInfoClassReference = ReferenceType.createResolvedReference("EventInfo", eventInfoClass, context.project);

    // Get all resolved reflections that could be an event.
    const eventKind = ReflectionKind.ObjectLiteral | ReflectionKind.TypeAlias;
    const reflections = context.project.getReflectionsByKind(eventKind);

    // For each potential event reflection...
    for (const reflection of reflections) {
        // Skip if it is not an event.
        if (reflection.kindString !== "Event") {
            continue;
        }

        // Create the `eventInfo` parameter and set its type as the reference to the `EventInfo` class.
        const eventInfoParameter = new TypeParameterReflection("eventInfo", eventInfoClassReference, undefined, reflection);

        // Add a comment to the `eventInfo` parameter.
        eventInfoParameter.comment = new Comment([
            {
                kind: "text",
                text: "An object containing information about the fired event.",
            },
        ]);

        // The first parameter for each event is always `eventInfo`.
        reflection.typeParameters = reflection.typeParameters || [];
        reflection.typeParameters.unshift(eventInfoParameter);
    }
};

/**
 * The `typedoc-plugin-event-param-fixer` creates the `eventInfo` parameter that is of type `EventInfo` class,
 * and then inserts it as the first parameter for each found event reflection.
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_END, onEventEnd);
};
