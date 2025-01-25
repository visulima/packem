import React from "react";
import { ReactFC } from "../../types";

export const ConditionalWrap: ReactFC<{
  condition?: boolean;
  children: React.ReactNode;
  wrap: (children: React.ReactNode) => React.ReactElement;
  elseWrap?: (children: React.ReactNode) => React.ReactElement;
}> = ({ condition, children, wrap, elseWrap }) =>
  !!condition ? wrap(children) : elseWrap ? elseWrap(children) : children;
