import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-[#0f172a] placeholder:text-[#94a3b8] selection:bg-[#00cc6a] selection:text-white",
        // Mobile-first sizing: h-12 on mobile (48px touch target), h-10 on desktop
        "h-12 md:h-10 w-full min-w-0 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1",
        // Typography: 16px on mobile (prevents iOS zoom), 14px on desktop
        "text-base md:text-sm text-[#0f172a]",
        "transition-[color,box-shadow,border-color] outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[#00cc6a] focus-visible:ring-1 focus-visible:ring-[#00cc6a]",
        "aria-invalid:ring-[#ef4444]/20 aria-invalid:border-[#ef4444]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
