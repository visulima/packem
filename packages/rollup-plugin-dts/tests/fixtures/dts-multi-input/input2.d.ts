import type { User } from "./types.js";

export interface UserWithAge extends User {
    age: number;
}
