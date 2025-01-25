import clsx, { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names or conditional class names and merges Tailwind CSS classes efficiently
 * @param classes - Array of class names, objects, or falsy values
 * @returns Merged and deduplicated className string
 * @example
 * cn('px-2', 'py-1', { 'bg-red-500': isError })
 * // Returns: "px-2 py-1 bg-red-500" (if isError is true)
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(...classes));
}
