/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import { join } from "@visulima/path";
import { glob } from "tinyglobby";
import type { ProjectReflection } from "typedoc";
import { Application, ReflectionKind, TSConfigReader, TypeDocReader } from "typedoc";
import { beforeAll, describe, expect, it } from "vitest";

const FIXTURES_PATH = join("./", "__tests__", "tag-observable", "fixtures");

describe("typedoc-plugins/tag-observable", () => {
    let typeDocument: Application;
    let conversionResult: ProjectReflection;

    beforeAll(async () => {
        const sourceFilePatterns = [join(FIXTURES_PATH, "**", "*.ts")];

        const files = await glob(sourceFilePatterns);

        typeDocument = await Application.bootstrapWithPlugins(
            {
                entryPoints: files,
                excludePrivate: false,
                logLevel: "Error",
                plugin: ["./dist/tag-observable.mjs"],
                tsconfig: join(FIXTURES_PATH, "tsconfig.json"),
            },
            [new TSConfigReader(), new TypeDocReader()],
        );

        expect(files).not.lengthOf(0);

        conversionResult = (await typeDocument.convert()) as ProjectReflection;

        expect(conversionResult).to.be.an("object");
    });

    it("should find all observable class properties within the project", async () => {
        const reflections = conversionResult.getReflectionsByKind(ReflectionKind.Property).filter((item) => item.comment?.getTag("@observable"));

        // The order of found reflections does not matter, so just check if all expected observable properties are found.
        expect(reflections.find((reference) => reference.parent.name === "ExampleClass" && reference.name === "key")).toBeDefined();
        expect(reflections.find((reference) => reference.parent.name === "ExampleClass" && reference.name === "value")).toBeDefined();
        expect(reflections.find((reference) => reference.parent.name === "ExampleClass" && reference.name === "secret")).toBeDefined();
        expect(reflections.find((reference) => reference.parent.name === "CustomExampleClass" && reference.name === "key")).toBeDefined();
        expect(reflections.find((reference) => reference.parent.name === "CustomExampleClass" && reference.name === "value")).toBeDefined();
        expect(reflections.find((reference) => reference.parent.name === "CustomExampleClass" && reference.name === "property")).toBeDefined();
        expect(reflections.find((reference) => reference.parent.name === "CustomExampleClass" && reference.name === "anotherProperty")).toBeDefined();
        expect(reflections.find((reference) => reference.parent.name === "CustomExampleClass" && reference.name === "staticProperty")).toBeDefined();

        // There should be found the following observable properties:
        // * ExampleClass#key
        // * ExampleClass#value
        // * ExampleClass#secret
        // * CustomExampleClass#key (inherited from ExampleClass)
        // * CustomExampleClass#value (inherited from ExampleClass)
        // * CustomExampleClass#property
        // * CustomExampleClass#anotherProperty
        // * CustomExampleClass.staticProperty
        expect(reflections).toHaveLength(8);
    });

    describe("events", () => {
        let baseClassDefinition;
        let derivedClassDefinition;

        beforeAll(() => {
            baseClassDefinition = conversionResult?.children
                ?.find((entry) => entry.name === "exampleclass")
                .children.find((entry) => entry.kindString === "Class" && entry.name === "ExampleClass");

            derivedClassDefinition = conversionResult?.children
                ?.find((entry) => entry.name === "customexampleclass")
                .children.find((entry) => entry.kindString === "Class" && entry.name === "CustomExampleClass");
        });

        it("should find all events in the base class", () => {
            const eventDefinitions = baseClassDefinition.children.filter((children) => children.kindString === "Event");

            expect(eventDefinitions).toHaveLength(10);

            expect(eventDefinitions.map((event) => event.name)).to.have.members([
                "event:change:key",
                "event:change:value",
                "event:change:secret",
                "event:change:setSecret",
                "event:change:hasSecret",

                "event:set:key",
                "event:set:value",
                "event:set:secret",
                "event:set:setSecret",
                "event:set:hasSecret",
            ]);
        });

        it("should find all events in the derived class", () => {
            const eventDefinitions = derivedClassDefinition.children.filter((children) => children.kindString === "Event");

            expect(eventDefinitions).toHaveLength(14);

            expect(eventDefinitions.map((event) => event.name)).to.have.members([
                "event:change:key",
                "event:change:value",
                "event:change:property",
                "event:change:staticProperty",
                "event:change:anotherProperty",
                "event:change:setSecret",
                "event:change:hasSecret",

                "event:set:key",
                "event:set:value",
                "event:set:property",
                "event:set:staticProperty",
                "event:set:anotherProperty",
                "event:set:setSecret",
                "event:set:hasSecret",
            ]);
        });

        for (const eventName of ["key", "hasSecret"]) {
            for (const eventType of ["change", "set"]) {
                it(`should properly define the "event:${eventType}:${eventName}" event`, () => {
                    const eventDefinition = baseClassDefinition.children.find((doclet) => doclet.name === `event:${eventType}:${eventName}`);

                    const expectedCommentSummary =
                        `Fired when the \`${eventName}\` property ` +
                        (eventType === "change" ? "changed value." : "is going to be set but is not set yet (before the `change` event is fired).");

                    expect(eventDefinition).toBeDefined();
                    expect(eventDefinition.name).toStrictEqual(`event:${eventType}:${eventName}`);
                    expect(eventDefinition.originalName).toStrictEqual(`event:${eventType}:${eventName}`);
                    expect(eventDefinition.kindString).toStrictEqual("Event");

                    expect(eventDefinition.comment).toHaveProperty("summary");
                    expect(eventDefinition.comment).toHaveProperty("blockTags");
                    expect(eventDefinition.comment).toHaveProperty("modifierTags");

                    expect(eventDefinition.comment.blockTags).to.be.an("array");
                    expect(eventDefinition.comment.blockTags).toHaveLength(0);
                    expect(eventDefinition.comment.modifierTags).to.be.a("Set");
                    expect(eventDefinition.comment.modifierTags.size).toStrictEqual(0);
                    expect(eventDefinition.comment.summary).to.be.an("array");
                    expect(eventDefinition.comment.summary).toHaveLength(1);
                    expect(eventDefinition.comment.summary[0]).toHaveProperty("kind", "text");
                    expect(eventDefinition.comment.summary[0]).toHaveProperty("text", expectedCommentSummary);

                    expect(eventDefinition.typeParameters).to.be.an("array");
                    expect(eventDefinition.typeParameters).toHaveLength(3);

                    expect(eventDefinition.typeParameters[0]).toHaveProperty("name", "name");
                    expect(eventDefinition.typeParameters[0]).toHaveProperty("type");
                    expect(eventDefinition.typeParameters[0].type).toHaveProperty("name", "string");
                    expect(eventDefinition.typeParameters[0]).toHaveProperty("comment");
                    expect(eventDefinition.typeParameters[0].comment).toHaveProperty("summary");
                    expect(eventDefinition.typeParameters[0].comment.summary).to.be.an("array");
                    expect(eventDefinition.typeParameters[0].comment.summary[0]).toHaveProperty("kind", "text");
                    expect(eventDefinition.typeParameters[0].comment.summary[0]).toHaveProperty("text", `Name of the changed property (\`${eventName}\`).`);

                    expect(eventDefinition.typeParameters[1]).toHaveProperty("name", "value");
                    expect(eventDefinition.typeParameters[1]).toHaveProperty("comment");
                    expect(eventDefinition.typeParameters[1].comment).toHaveProperty("summary");
                    expect(eventDefinition.typeParameters[1].comment.summary).to.be.an("array");
                    expect(eventDefinition.typeParameters[1].comment.summary[0]).toHaveProperty("kind", "text");
                    expect(eventDefinition.typeParameters[1].comment.summary[0]).toHaveProperty(
                        "text",
                        `New value of the \`${eventName}\` property with given key or \`null\`, if operation should remove property.`,
                    );

                    expect(eventDefinition.typeParameters[2]).toHaveProperty("name", "oldValue");
                    expect(eventDefinition.typeParameters[2]).toHaveProperty("comment");
                    expect(eventDefinition.typeParameters[2].comment).toHaveProperty("summary");
                    expect(eventDefinition.typeParameters[2].comment.summary).to.be.an("array");
                    expect(eventDefinition.typeParameters[2].comment.summary[0]).toHaveProperty("kind", "text");
                    expect(eventDefinition.typeParameters[2].comment.summary[0]).toHaveProperty(
                        "text",
                        `Old value of the \`${eventName}\` property with given key or \`null\`, if property was not set before.`,
                    );

                    expect(eventDefinition.sources).to.be.an("array");
                    expect(eventDefinition.sources).toHaveLength(1);
                    expect(eventDefinition.sources[0]).toHaveProperty("fileName", "exampleclass.ts");
                    expect(eventDefinition.sources[0]).toHaveProperty("fullFileName");
                    expect(eventDefinition.sources[0]).toHaveProperty("line");
                    expect(eventDefinition.sources[0]).toHaveProperty("character");
                    expect(eventDefinition.sources[0]).toHaveProperty("url");
                });
            }
        }

        it("should define the `inheritedFrom` property for an inherited observable property (change:${ property })", () => {
            const eventDefinitions = derivedClassDefinition.children.filter((children) => children.kindString === "Event");

            const changeKeyEvent = eventDefinitions.find((event) => event.name === "event:change:key");

            expect(changeKeyEvent).toBeDefined();
            expect(changeKeyEvent).toHaveProperty("inheritedFrom");

            expect(changeKeyEvent.inheritedFrom.reflection.parent).toStrictEqual(baseClassDefinition);
        });

        it("should define the `inheritedFrom` property for an inherited observable property (set:${ property })", () => {
            const eventDefinitions = derivedClassDefinition.children.filter((children) => children.kindString === "Event");

            const setKeyEvent = eventDefinitions.find((event) => event.name === "event:set:key");

            expect(setKeyEvent).toBeDefined();
            expect(setKeyEvent).toHaveProperty("inheritedFrom");

            expect(setKeyEvent.inheritedFrom.reflection.parent).toStrictEqual(baseClassDefinition);
        });
    });
});
