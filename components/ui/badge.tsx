import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-sm border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-[#00cc6a] focus-visible:ring-[#00cc6a]/50 focus-visible:ring-[3px] aria-invalid:ring-[#ef4444]/20 aria-invalid:border-[#ef4444] transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#f1f5f9] text-[#475569] [a&]:hover:bg-[#e2e8f0]",
        secondary:
          "border-transparent bg-[#f1f5f9] text-[#475569] [a&]:hover:bg-[#e2e8f0]",
        success:
          "border-transparent bg-[#dcfce7] text-[#00cc6a] [a&]:hover:bg-[#bbf7d0]",
        warning:
          "border-transparent bg-amber-50 text-amber-600 [a&]:hover:bg-amber-100",
        destructive:
          "border-transparent bg-red-50 text-red-600 [a&]:hover:bg-red-100 focus-visible:ring-[#ef4444]/20",
        processing:
          "border-transparent bg-blue-50 text-blue-600 [a&]:hover:bg-blue-100",
        outline:
          "border-[#e2e8f0] text-[#0f172a] [a&]:hover:bg-[#f1f5f9]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
