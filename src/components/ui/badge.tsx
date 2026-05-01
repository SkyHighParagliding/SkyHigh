import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.ComponentProps<"div"> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "low" | "medium" | "high"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-navy text-white": variant === "default",
          "border-transparent bg-sky text-white": variant === "secondary",
          "border-transparent bg-red-500 text-white": variant === "destructive",
          "text-foreground": variant === "outline",
          "border-transparent bg-hazard-low text-white": variant === "low",
          "border-transparent bg-hazard-medium text-white": variant === "medium",
          "border-transparent bg-hazard-high text-white": variant === "high",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
