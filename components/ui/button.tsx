import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-brand text-white shadow-sm hover:bg-brand-600 active:bg-brand-700 focus-visible:ring-brand/50",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive active:bg-destructive focus-visible:ring-destructive/50",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent active:bg-border focus-visible:ring-brand/30",
        secondary:
          "bg-accent text-foreground border border-border hover:bg-border active:bg-muted-foreground focus-visible:ring-brand/30",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-accent active:bg-border focus-visible:ring-brand/30",
        link: "text-brand-foreground underline-offset-4 hover:underline hover:text-brand-foreground/80",
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
