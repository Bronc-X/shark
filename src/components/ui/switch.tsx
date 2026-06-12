import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn("h-5 w-9 appearance-none rounded-full bg-input p-0.5 shadow-inner transition checked:bg-primary before:block before:size-4 before:rounded-full before:bg-background before:shadow before:transition checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props}
  />
));
Switch.displayName = "Switch";
