import { PropsWithChildren } from "react";
import React from "react";

export type ReactFC<T> = React.FC<PropsWithChildren & T>;
