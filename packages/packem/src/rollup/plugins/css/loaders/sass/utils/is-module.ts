const isModule = (url: string): boolean => /^~[\d@A-Z]/i.test(url);

export default isModule;
