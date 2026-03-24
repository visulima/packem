/// <reference types="node" />

export { readConfig } from "./types";
export { resolve } from "./helper";

export function getVersion(): string {
  return process.version;
}
