import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-brand selection:text-white",
        // Mobile-first sizing: h-12 on mobile (48px touch target), h-10 on desktop
        "h-12 md:h-10 w-full min-w-0 rounded-md border border-border bg-muted px-3 py-1",
        // Typography: 16px on mobile (prevents iOS zoom), 14px on desktop
        "text-base md:text-sm text-foreground",
        "transition-[color,box-shadow,border-color] outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
