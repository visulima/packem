const svgEncoder = (buffer: Buffer): string => {
    let svgString = buffer.toString("utf8");

    svgString = svgString.replaceAll("//gs", "");
    svgString = svgString.replaceAll(/\s*class\s*=\s*(["'])(?:(?!\1)[\s\S])*?\1/g, "");

    svgString = svgString.replaceAll(/[\n\r\t]/g, " ");
    svgString = svgString.replaceAll(/\s{2,}/g, " ");
    svgString = svgString.trim();

    return Buffer.from(svgString, "utf8").toString("base64");
};

export default svgEncoder;
