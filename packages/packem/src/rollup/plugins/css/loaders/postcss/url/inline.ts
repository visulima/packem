import liteMime from "mime/lite";

export default (file: string, source: Uint8Array): string => {
    const mime = liteMime.getType(file) ?? "application/octet-stream";
    const data = Buffer.from(source).toString("base64");

    return `data:${mime};base64,${data}`;
};
