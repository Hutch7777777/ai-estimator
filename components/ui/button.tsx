import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#00cc6a]/50 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-[#00cc6a] text-white shadow-sm hover:bg-[#00b35e] active:bg-[#009e52] focus-visible:ring-[#00cc6a]/50",
        destructive:
          "bg-[#ef4444] text-white shadow-sm hover:bg-[#dc2626] active:bg-[#b91c1c] focus-visible:ring-[#ef4444]/50",
        outline:
          "border border-[#e2e8f0] bg-transparent text-[#0f172a] hover:bg-[#f1f5f9] active:bg-[#e2e8f0] focus-visible:ring-[#00cc6a]/30",
        secondary:
          "bg-[#f1f5f9] text-[#0f172a] border border-[#e2e8f0] hover:bg-[#e2e8f0] active:bg-[#cbd5e1] focus-visible:ring-[#00cc6a]/30",
        ghost:
          "bg-transparent text-[#475569] hover:bg-[#f1f5f9] active:bg-[#e2e8f0] focus-visible:ring-[#00cc6a]/30",
        link: "text-[#00cc6a] underline-offset-4 hover:underline hover:text-[#00b35e]",
      },
      size: {
        // Mobile-first: h-11 on mobile (44px touch), h-10 on desktop
        default: "h-11 md:h-10 px-5 py-2.5 has-[>svg]:px-4",
        // Small size: h-10 on mobile (40px), h-8 on desktop
        sm: "h-10 md:h-8 rounded-sm gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        // Large size already 48px - perfect for mobile
        lg: "h-12 rounded-sm px-6 text-base has-[>svg]:px-5",
        // Icon buttons: 44px on mobile, 40px on desktop
        icon: "size-11 md:size-10",
        "icon-sm": "size-10 md:size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
