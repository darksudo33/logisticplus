import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="skeleton"
      data-testid="skeleton"
      className={cn("skeleton-shimmer block rounded-lg bg-muted", className)}
      {...props}
    />
  )
}

function ActionSkeleton({
  className,
  inverted = false,
}: {
  className?: string
  inverted?: boolean
}) {
  return (
    <Skeleton
      data-testid="action-skeleton"
      className={cn(
        "h-4 w-24 rounded-md",
        inverted ? "bg-primary-foreground/55" : "bg-muted-foreground/25",
        className
      )}
    />
  )
}

export { ActionSkeleton, Skeleton }
