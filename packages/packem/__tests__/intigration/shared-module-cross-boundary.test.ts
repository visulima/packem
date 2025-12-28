import { rm } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createJob, getFileContents, getFileNamesFromDirectory } from "../helpers/testing-utils";

describe("integration - shared-module-cross-boundary", () => {
    let distDirectory: string;
    let temporaryDirectory: string;

    beforeEach(async () => {
        const result = await createJob({
            directory: "shared-module-cross-boundary",
        });

        distDirectory = result.distDir;
        temporaryDirectory = result.tempDir;
    });

    afterEach(async () => {
        if (temporaryDirectory) {
            await rm(temporaryDirectory, { recursive: true });
        }
    });

    it("should split shared module into separate chunk when imported by both client and server", async () => {
        expect.assertions(13);

        const jsFiles = await getFileNamesFromDirectory(distDirectory);
        const fileContents = await getFileContents(distDirectory);

        // Verify that a shared chunk is created for the cross-boundary shared module
        // The shared module should NOT be inlined into either client or server chunks
        // The chunk name pattern is: shared-{hash}.js (where hash is based on the layers)
        // Chunks are in packem_shared/ directory
        const crossBoundarySharedChunks = jsFiles.filter((f) => f.includes("shared-") && !f.includes("client") && !f.includes("server") && f.endsWith(".js"));

        // There should be exactly one cross-boundary shared chunk created
        expect(crossBoundarySharedChunks).toHaveLength(1);

        const sharedChunk = crossBoundarySharedChunks[0];

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!sharedChunk) {
            throw new Error("Shared chunk not found");
        }

        const sharedContent = fileContents[sharedChunk];

        // Validate shared chunk content
        expect(sharedContent).toContain("shared-util-value");
        expect(sharedContent).toContain("shared-constant");

        // The shared chunk should NOT have any directive
        expect(sharedContent).not.toMatch(/^['"]use (client|server)['"]/m);

        // Verify the main entry file exists
        expect(jsFiles).toContain("index.js");

        // Verify client and server chunks exist
        // Chunks are named after exports due to chunkSplitter plugin
        const clientChunks = jsFiles.filter((f) => (f.includes("ClientComponent") || f.includes("ClientComponent2")) && f.endsWith(".js"));
        const serverChunks = jsFiles.filter((f) => f.includes("serverAction") && f.endsWith(".js"));

        expect(clientChunks).toHaveLength(2); // ClientComponent and ClientComponent2
        expect(serverChunks).toHaveLength(1);

        // Validate that client chunks import from shared chunk (not inline)
        // Extract just the filename from the full path for matching imports
        const sharedChunkFilename = sharedChunk.split("/").pop() || sharedChunk;

        for (const clientChunk of clientChunks) {
            // Check for the import pattern (relative path to shared chunk)
            // The import will be like: import ... from './shared-1ko-Dbltucaw.js'
            expect(fileContents[clientChunk]).toContain(sharedChunkFilename);
            expect(fileContents[clientChunk]).toContain("'use client'");
        }

        // Validate that server chunk imports from shared chunk (not inline)
        const serverChunk = serverChunks[0];

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!serverChunk) {
            throw new Error("Server chunk not found");
        }

        // Check for the import pattern (relative path to shared chunk)
        expect(fileContents[serverChunk]).toContain(sharedChunkFilename);
        expect(fileContents[serverChunk]).toContain("'use server'");
    });

    it("should have client and server chunks import from the cross-boundary shared chunk", async () => {
        expect.assertions(9);

        const fileContents = await getFileContents(distDirectory);

        // Find the cross-boundary shared chunk filename (shared between client and server)
        // Chunks are in packem_shared/ directory
        const crossBoundarySharedChunk = Object.keys(fileContents).find(
            (f) => f.includes("shared-") && !f.includes("client") && !f.includes("server") && f.endsWith(".js") && !f.endsWith(".d.ts"),
        );

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!crossBoundarySharedChunk) {
            throw new Error("Cross-boundary shared chunk not found");
        }

        // The cross-boundary shared chunk should contain the shared utilities
        const sharedContent = fileContents[crossBoundarySharedChunk];

        expect(sharedContent).toContain("shared-util-value");
        expect(sharedContent).toContain("shared-constant");

        // The shared chunk should NOT have any directive
        expect(sharedContent).not.toMatch(/^['"]use (client|server)['"]/m);

        // Find client and server boundary chunks (named after exports)
        const clientChunk = Object.keys(fileContents).find(
            (f) => f.includes("ClientComponent") && !f.includes("ClientComponent2") && f.endsWith(".js") && !f.endsWith(".d.ts"),
        );
        const serverChunk = Object.keys(fileContents).find((f) => f.includes("serverAction") && f.endsWith(".js") && !f.endsWith(".d.ts"));

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!clientChunk) {
            throw new Error("Client chunk not found");
        }

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!serverChunk) {
            throw new Error("Server chunk not found");
        }

        // Extract just the filename from the full path for matching imports
        const sharedChunkFilename = crossBoundarySharedChunk.split("/").pop() || crossBoundarySharedChunk;

        // Client chunk should import from the cross-boundary shared chunk
        // The import will be like: import ... from './shared-1ko-Dbltucaw.js'
        expect(fileContents[clientChunk]).toContain(sharedChunkFilename);
        expect(fileContents[clientChunk]).toContain("'use client'");

        // Client chunk should NOT contain the cross-boundary shared utilities directly
        expect(fileContents[clientChunk]).not.toContain("shared-util-value");

        // Server chunk should import from the cross-boundary shared chunk
        // The import will be like: import ... from './shared-1ko-Dbltucaw.js'
        expect(fileContents[serverChunk]).toContain(sharedChunkFilename);
        expect(fileContents[serverChunk]).toContain("'use server'");

        // Server chunk should NOT contain the shared utilities directly
        expect(fileContents[serverChunk]).not.toContain("shared-util-value");
    });

    it("should NOT have server chunk importing from client chunk", async () => {
        expect.assertions(3);

        const fileContents = await getFileContents(distDirectory);

        // Find client and server boundary chunks (named after exports)
        const clientChunks = Object.keys(fileContents).filter(
            (f) => (f.includes("ClientComponent") || f.includes("ClientComponent2")) && f.endsWith(".js") && !f.endsWith(".d.ts"),
        );
        const serverChunk = Object.keys(fileContents).find((f) => f.includes("serverAction") && f.endsWith(".js") && !f.endsWith(".d.ts"));

        expect(clientChunks.length).toBeGreaterThan(0);

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!serverChunk) {
            throw new Error("Server chunk not found");
        }

        // Server chunk should NOT import from any client chunk (the original bug)
        // It should only import from the shared chunk
        for (const clientChunk of clientChunks) {
            expect(fileContents[serverChunk]).not.toContain(clientChunk);
        }
    });

    it("should allow same-layer client modules to share code without cross-boundary issues", async () => {
        expect.assertions(8);

        const fileContents = await getFileContents(distDirectory);
        const jsFiles = Object.keys(fileContents).filter((f) => f.endsWith(".js") && !f.endsWith(".d.ts"));

        // Find client chunks (named after exports)
        const clientChunk = jsFiles.find((f) => f.includes("ClientComponent") && !f.includes("ClientComponent2"));
        const client2Chunk = jsFiles.find((f) => f.includes("ClientComponent2"));

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!clientChunk) {
            throw new Error("Client chunk not found");
        }

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!client2Chunk) {
            throw new Error("Client2 chunk not found");
        }

        // The client-only shared module is shared between two 'use client' modules.
        // Since they're in the SAME layer, Rollup may inline the shared code into one
        // client chunk and have the other import from it - this is valid because
        // there's no boundary crossing (both are client layer).

        // Extract content after type checks
        const clientChunkContent = fileContents[clientChunk];

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!clientChunkContent) {
            throw new Error(`Client chunk content not found for ${clientChunk}`);
        }

        const client2ChunkContent = fileContents[client2Chunk];

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!client2ChunkContent) {
            throw new Error(`Client2 chunk content not found for ${client2Chunk}`);
        }

        // Check that the client-only-shared utility exists in the bundle
        // The function is imported, so we check for the import or function name
        const allClientContent = clientChunkContent + client2ChunkContent;

        // Check for the import of client-only-shared chunk or the function name
        expect(allClientContent.includes("client-only-shared") || allClientContent.includes("clientOnlyUtil")).toBe(true);

        // Both client chunks should import from the client-only-shared chunk
        // (or one could have it inlined, but both importing is also valid)
        const clientImportsShared = clientChunkContent.includes("client-only-shared");
        const client2ImportsShared = client2ChunkContent.includes("client-only-shared");

        // At least one should import from the shared chunk (or have it inlined)
        expect(clientImportsShared || client2ImportsShared).toBe(true);

        // Both chunks should reference the shared code (either via import or inline)
        // This ensures the client-only-shared module is accessible to both client chunks
        expect(clientChunkContent).toMatch(/client-only-shared|clientOnlyUtil/);
        expect(client2ChunkContent).toMatch(/client-only-shared|clientOnlyUtil/);

        // Both client chunks should still have the 'use client' directive
        expect(fileContents[clientChunk]).toContain("'use client'");
        expect(fileContents[client2Chunk]).toContain("'use client'");

        // IMPORTANT: Server chunk should NOT import from any client chunk
        // This is the key difference - cross-boundary shared modules get split,
        // but same-layer shared modules can safely share code between chunks
        const serverChunk = jsFiles.find((f) => f.includes("serverAction"));

        // eslint-disable-next-line vitest/no-conditional-in-test
        if (!serverChunk) {
            throw new Error("Server chunk not found");
        }

        expect(fileContents[serverChunk]).not.toContain(clientChunk);
        expect(fileContents[serverChunk]).not.toContain(client2Chunk);
    });
});
