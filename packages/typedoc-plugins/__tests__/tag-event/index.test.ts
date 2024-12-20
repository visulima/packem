/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import { join } from "@visulima/path";
import { glob } from "tinyglobby";
import type { ProjectReflection } from "typedoc";
import { Application, ReflectionKind, TSConfigReader, TypeDocReader } from "typedoc";
import { beforeAll, describe, expect, it } from "vitest";

const FIXTURES_PATH = join("./", "__tests__", "tag-event", "fixtures");

describe("typedoc-plugins/tag-event", () => {
    let typeDocument: Application;
    let conversionResult: ProjectReflection;

    beforeAll(async () => {
        const sourceFilePatterns = [join(FIXTURES_PATH, "**", "*.ts")];

        const files = await glob(sourceFilePatterns);

        typeDocument = await Application.bootstrapWithPlugins(
            {
                entryPoints: files,
                excludePrivate: false,
                logLevel: "Warn",
                plugin: ["./dist/tag-event.mjs"],
                tsconfig: join(FIXTURES_PATH, "tsconfig.json"),
            },
            [new TSConfigReader(), new TypeDocReader()],
        );

        expect(files).not.lengthOf(0);

        conversionResult = (await typeDocument.convert()) as ProjectReflection;

        expect(conversionResult).toBeTypeOf("object");
    });

    it("should find all event tags within the project", () => {
        const eventDefinitions = conversionResult.getReflectionsByKind(ReflectionKind.All).filter((children) => children.kindString === "Event");

        expect(eventDefinitions).toHaveLength(20);

        // The order of found events does not matter, so just check if all of them are found.
        expect(eventDefinitions.find((event) => event.name === "event:event-foo")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-no-text")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-with-params")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-no-content")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-empty-args")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-optional-args")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-inline-args")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-anonymous-args")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-anonymous-optional-args")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-reference")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-generic-from-type-arg")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-generic-from-base-type")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-complex")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-absolute")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-absolute-with-prefix")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-change:{property}")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-set:{property}")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-multiple-names")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-multiple-names:variant")).toBeDefined();
        expect(eventDefinitions.find((event) => event.name === "event:event-foo-multiple-names:variant:subvariant")).toBeDefined();
    });

    it("should find all event tags within the interface", () => {
        const eventDefinitions = conversionResult.children
            .find((entry) => entry.name === "exampleinterface")
            .children.find((entry) => entry.kindString === "Interface" && entry.name === "ExampleInterface")
            .children.filter((children) => children.kindString === "Event");

        expect(eventDefinitions).toHaveLength(2);
    });

    it("should inform if the class for an event has not been found", () => {
        const invalidEventNameTags = [
            "~InvalidClass#event-foo-relative-invalid-class",
            "~ExampleType#event-foo-relative-invalid-parent",
            "#event-foo-relative-invalid-name-with-separator",
            "event-foo-relative-invalid-name-without-separator",
            "module:invalidmodule~EventsInvalidClass#event-foo-absolute-invalid-module",
            "module:eventsvalid~InvalidClass#event-foo-absolute-invalid-class",
            "module:eventsvalid~ExampleType#event-foo-absolute-invalid-parent",
        ];

        for (const eventName of invalidEventNameTags) {
            expect(typeDocument.logger.warn.calledWith(`Skipping unsupported "${eventName}" event.`)).to.be.true;
        }
    });

    describe("event definitions", () => {
        let classDefinition;

        beforeAll(() => {
            classDefinition = conversionResult.children
                .find((entry) => entry.name === "eventsvalid")
                .children.find((entry) => entry.kindString === "Class" && entry.name === "EventsValidClass");
        });

        it("should find an event tag without description and parameters", () => {
            const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-no-text");

            expect(eventDefinition).toBeDefined();
            expect(eventDefinition.name).to.equal("event:event-foo-no-text");
            expect(eventDefinition.originalName).to.equal("event:event-foo-no-text");
            expect(eventDefinition.kindString).to.equal("Event");

            expect(eventDefinition.comment).toHaveProperty("summary");
            expect(eventDefinition.comment).toHaveProperty("blockTags");
            expect(eventDefinition.comment).toHaveProperty("modifierTags");

            expect(eventDefinition.comment.summary).to.be.an("array");
            expect(eventDefinition.comment.summary).toHaveLength(0);
            expect(eventDefinition.comment.blockTags).to.be.an("array");
            expect(eventDefinition.comment.blockTags).toHaveLength(1);
            expect(eventDefinition.comment.blockTags[0]).toHaveProperty("tag", "@eventName");
            expect(eventDefinition.comment.modifierTags).to.be.a("Set");
            expect(eventDefinition.comment.modifierTags.size).to.equal(0);

            expect(eventDefinition.sources).to.be.an("array");
            expect(eventDefinition.sources).toHaveLength(1);
            expect(eventDefinition.sources[0]).toHaveProperty("fileName", "eventsvalid.ts");
            expect(eventDefinition.sources[0]).toHaveProperty("fullFileName");
            expect(eventDefinition.sources[0]).toHaveProperty("line");
            expect(eventDefinition.sources[0]).toHaveProperty("character");
            expect(eventDefinition.sources[0]).toHaveProperty("url");

            expect(eventDefinition.typeParameters).to.be.undefined;
        });

        it("should find an event tag with description and without parameters", () => {
            const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo");

            expect(eventDefinition).toBeDefined();
            expect(eventDefinition.name).to.equal("event:event-foo");
            expect(eventDefinition.originalName).to.equal("event:event-foo");
            expect(eventDefinition.kindString).to.equal("Event");

            expect(eventDefinition.comment).toHaveProperty("summary");
            expect(eventDefinition.comment).toHaveProperty("blockTags");
            expect(eventDefinition.comment).toHaveProperty("modifierTags");

            expect(eventDefinition.comment.summary).to.be.an("array");
            expect(eventDefinition.comment.summary).toHaveLength(1);
            expect(eventDefinition.comment.summary[0]).toHaveProperty("kind", "text");
            expect(eventDefinition.comment.summary[0]).toHaveProperty("text", "An event associated with the type.");
            expect(eventDefinition.comment.blockTags).to.be.an("array");
            expect(eventDefinition.comment.blockTags).toHaveLength(1);
            expect(eventDefinition.comment.blockTags[0]).toHaveProperty("tag", "@eventName");
            expect(eventDefinition.comment.modifierTags).to.be.a("Set");
            expect(eventDefinition.comment.modifierTags.size).to.equal(0);

            expect(eventDefinition.typeParameters).to.be.undefined;
        });

        it("should find an event tag with description and parameters", () => {
            const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-with-params");

            expect(eventDefinition).toBeDefined();
            expect(eventDefinition.name).to.equal("event:event-foo-with-params");
            expect(eventDefinition.originalName).to.equal("event:event-foo-with-params");
            expect(eventDefinition.kindString).to.equal("Event");

            expect(eventDefinition.comment).toHaveProperty("summary");
            expect(eventDefinition.comment).toHaveProperty("blockTags");
            expect(eventDefinition.comment).toHaveProperty("modifierTags");

            expect(eventDefinition.comment.summary).to.be.an("array");
            expect(eventDefinition.comment.summary).toHaveLength(5);

            expect(eventDefinition.comment.summary[0]).toHaveProperty("kind", "text");
            expect(eventDefinition.comment.summary[0]).toHaveProperty("text", "An event associated with the type. Event with three params.\n\nSee ");

            expect(eventDefinition.comment.summary[1]).toHaveProperty("kind", "inline-tag");
            expect(eventDefinition.comment.summary[1]).toHaveProperty("tag", "@link");
            expect(eventDefinition.comment.summary[1]).toHaveProperty("text", "~EventsValidClass");

            expect(eventDefinition.comment.summary[2]).toHaveProperty("kind", "text");
            expect(eventDefinition.comment.summary[2]).toHaveProperty("text", " or ");

            expect(eventDefinition.comment.summary[3]).toHaveProperty("kind", "inline-tag");
            expect(eventDefinition.comment.summary[3]).toHaveProperty("tag", "@link");
            expect(eventDefinition.comment.summary[3]).toHaveProperty("text", "module:fixtures/eventsvalid~EventsValidClass Custom label");

            expect(eventDefinition.comment.summary[4]).toHaveProperty("kind", "text");
            expect(eventDefinition.comment.summary[4]).toHaveProperty("text", ". A text after.");

            expect(eventDefinition.comment.blockTags).to.be.an("array");
            expect(eventDefinition.comment.blockTags).toHaveLength(5);
            expect(eventDefinition.comment.blockTags[0]).toHaveProperty("tag", "@eventName");
            expect(eventDefinition.comment.blockTags[1]).toHaveProperty("tag", "@param");
            expect(eventDefinition.comment.blockTags[2]).toHaveProperty("tag", "@param");
            expect(eventDefinition.comment.blockTags[3]).toHaveProperty("tag", "@param");
            expect(eventDefinition.comment.blockTags[4]).toHaveProperty("tag", "@deprecated");

            expect(eventDefinition.comment.modifierTags).to.be.a("Set");
            expect(eventDefinition.comment.modifierTags.size).to.equal(0);

            expect(eventDefinition.typeParameters).to.be.an("array");
            expect(eventDefinition.typeParameters).toHaveLength(3);

            expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "p1");
            expect(eventDefinition.typeParameters[0]).toHaveProperty("comment");
            expect(eventDefinition.typeParameters[0].comment).toHaveProperty("summary");
            expect(eventDefinition.typeParameters[0].comment.summary).to.be.an("array");
            expect(eventDefinition.typeParameters[0].comment.summary[0]).toHaveProperty("kind", "text");
            expect(eventDefinition.typeParameters[0].comment.summary[0]).toHaveProperty("text", "Description for first param.");

            expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "p2");
            expect(eventDefinition.typeParameters[1]).toHaveProperty("comment");
            expect(eventDefinition.typeParameters[1].comment).toHaveProperty("summary");
            expect(eventDefinition.typeParameters[1].comment.summary).to.be.an("array");
            expect(eventDefinition.typeParameters[1].comment.summary[0]).toHaveProperty("kind", "text");
            expect(eventDefinition.typeParameters[1].comment.summary[0]).toHaveProperty("text", "Description for second param.");

            expect(eventDefinition.typeParameters[2]).toHaveProperty("name", "p3");
            expect(eventDefinition.typeParameters[2]).toHaveProperty("comment");
            expect(eventDefinition.typeParameters[2].comment).toHaveProperty("summary");
            expect(eventDefinition.typeParameters[2].comment.summary).to.be.an("array");
            expect(eventDefinition.typeParameters[2].comment.summary).toHaveLength(5);

            expect(eventDefinition.typeParameters[2].comment.summary[0]).toHaveProperty("kind", "text");
            expect(eventDefinition.typeParameters[2].comment.summary[0]).toHaveProperty("text", "Complex ");

            expect(eventDefinition.typeParameters[2].comment.summary[1]).toHaveProperty("kind", "inline-tag");
            expect(eventDefinition.typeParameters[2].comment.summary[1]).toHaveProperty("tag", "@link");
            expect(eventDefinition.typeParameters[2].comment.summary[1]).toHaveProperty("text", "module:utils/object~Object description");

            expect(eventDefinition.typeParameters[2].comment.summary[2]).toHaveProperty("kind", "text");
            expect(eventDefinition.typeParameters[2].comment.summary[2]).toHaveProperty("text", " for ");

            expect(eventDefinition.typeParameters[2].comment.summary[3]).toHaveProperty("kind", "code");
            expect(eventDefinition.typeParameters[2].comment.summary[3]).toHaveProperty("text", "`third param`");

            expect(eventDefinition.typeParameters[2].comment.summary[4]).toHaveProperty("kind", "text");
            expect(eventDefinition.typeParameters[2].comment.summary[4]).toHaveProperty("text", ".");
        });

        describe("event parameters", () => {
            it('should convert event parameters from the "args" property', () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-with-params");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(3);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "p1");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("name", "string");

                expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "p2");
                expect(eventDefinition.typeParameters[1]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("name", "number");

                expect(eventDefinition.typeParameters[2]).toHaveProperty("name", "p3");
                expect(eventDefinition.typeParameters[2]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[2].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[2].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[2].type.element).toHaveProperty("type", "reference");
                expect(eventDefinition.typeParameters[2].type.element).toHaveProperty("name", "ExampleType");
            });

            it("should not add type parameters for event without content", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-no-content");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.undefined;
            });

            it("should not add type parameters for event with empty args", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-empty-args");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.undefined;
            });

            it("should convert optional event parameter", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-optional-args");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(2);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "p1");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("flags");
                expect(eventDefinition.typeParameters[0].flags).toHaveProperty("isOptional", false);
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("name", "string");

                expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "p2");
                expect(eventDefinition.typeParameters[1]).toHaveProperty("flags");
                expect(eventDefinition.typeParameters[1].flags).toHaveProperty("isOptional", true);
                expect(eventDefinition.typeParameters[1]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("name", "number");
            });

            it("should convert event parameter with name taken from @param tag", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-inline-args");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(1);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "p1");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "reflection");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("declaration");
                expect(eventDefinition.typeParameters[0].type.declaration).toHaveProperty("kindString", "Type literal");
            });

            it("should convert event parameter without a name", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-anonymous-args");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(2);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "<anonymous>");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("name", "number");

                expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "<anonymous>");
                expect(eventDefinition.typeParameters[1]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("type", "reflection");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("declaration");
                expect(eventDefinition.typeParameters[1].type.declaration).toHaveProperty("kindString", "Type literal");
            });

            it("should convert optional event parameter without a name", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-anonymous-optional-args");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(2);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "<anonymous>");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("flags");
                expect(eventDefinition.typeParameters[0].flags).toHaveProperty("isOptional", true);
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "optional");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("elementType");
                expect(eventDefinition.typeParameters[0].type.elementType).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type.elementType).toHaveProperty("name", "number");

                expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "<anonymous>");
                expect(eventDefinition.typeParameters[1]).toHaveProperty("flags");
                expect(eventDefinition.typeParameters[1].flags).toHaveProperty("isOptional", true);
                expect(eventDefinition.typeParameters[1]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("type", "optional");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("elementType");
                expect(eventDefinition.typeParameters[1].type.elementType).toHaveProperty("type", "reflection");
                expect(eventDefinition.typeParameters[1].type.elementType).toHaveProperty("declaration");
                expect(eventDefinition.typeParameters[1].type.elementType.declaration).toHaveProperty("kindString", "Type literal");
            });

            it("should convert event parameter that is a reference to another type", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-reference");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(2);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "p1");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("name", "string");

                expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "p2");
                expect(eventDefinition.typeParameters[1]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("type", "reference");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("name", "ExampleType");
            });

            it("should convert event parameter that came from a generic event definition (from type argument)", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-generic-from-type-arg");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(2);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "p1");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("name", "string");

                expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "p2");
                expect(eventDefinition.typeParameters[1]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("type", "reference");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("name", "ExampleType");
            });

            it("should convert event parameter that came from a generic event definition (from base type)", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-generic-from-base-type");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(2);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "p1");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type.element).toHaveProperty("name", "string");

                expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "p2");
                expect(eventDefinition.typeParameters[1]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("type", "named-tuple-member");
                expect(eventDefinition.typeParameters[1].type).toHaveProperty("element");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("type", "reference");
                expect(eventDefinition.typeParameters[1].type.element).toHaveProperty("name", "ExampleType");
            });

            it("should convert a complex event parameter but set its type to any", () => {
                const eventDefinition = classDefinition.children.find((doclet) => doclet.name === "event:event-foo-complex");

                expect(eventDefinition).toBeDefined();
                expect(eventDefinition.typeParameters).to.be.an("array");
                expect(eventDefinition.typeParameters).toHaveLength(1);

                expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "<anonymous>");
                expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("type", "intrinsic");
                expect(eventDefinition.typeParameters[0].type).toHaveProperty("name", "any");
            });
        });
    });

    describe("multiple event definitions", () => {
        it("should properly assign all events", () => {
            const event1 = conversionResult.getChildByName(["eventsvalid", "EventsValidClass", "event:event-foo-multiple-names"]);

            const event2 = conversionResult.getChildByName(["eventsvalid", "EventsValidClass", "event:event-foo-multiple-names:variant"]);

            const event3 = conversionResult.getChildByName(["eventsvalid", "EventsValidAnotherClass", "event:event-foo-multiple-names:variant:subvariant"]);

            expect(event1).toBeDefined();
            expect(event2).toBeDefined();
            expect(event3).toBeDefined();
        });
    });
});
