import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "../ui/Tooltip";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import React, { ReactNode } from "react";
import { cn } from "../../cn";

interface SimpleTooltipProps {
  children: React.ReactNode;
  content: string;
  className?: string;
  tooltipClassName?: string;
}

export const SimpleTooltip: React.FC<SimpleTooltipProps> = ({
  children,
  content,
  className,
  tooltipClassName,
}): ReactNode => {
  if (!content) {
    return children;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <TooltipRoot>
        <TooltipTrigger asChild className={className}>
          {children}
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className={cn("max-w-[200px]", tooltipClassName)}>
            {content}
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
  );
};
