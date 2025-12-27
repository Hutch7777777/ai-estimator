"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-[#e2e8f0] data-[state=checked]:bg-[#00cc6a] data-[state=checked]:text-white data-[state=checked]:border-[#00cc6a] focus-visible:border-[#00cc6a] focus-visible:ring-2 focus-visible:ring-[#00cc6a]/50 aria-invalid:ring-[#ef4444]/20 aria-invalid:border-[#ef4444] size-4 shrink-0 rounded-[4px] border transition-shadow outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
