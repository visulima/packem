export function importModule(name) {
    return import(`./data/${name}.ts`);
}