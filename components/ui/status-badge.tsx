import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      status: {
        draft: "bg-[#f1f5f9] text-[#64748b]",
        pending: "bg-amber-50 text-amber-600",
        processing: "bg-blue-50 text-blue-600",
        complete: "bg-[#dcfce7] text-[#00cc6a]",
        error: "bg-red-50 text-red-600",
      },
      size: {
        sm: "text-[10px] px-2 py-0.5",
        md: "text-xs px-2.5 py-0.5",
        lg: "text-sm px-3 py-1",
      }
    },
    defaultVariants: {
      status: "draft",
      size: "md",
    },
  }
)

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  className?: string
  showDot?: boolean
  children: React.ReactNode
}

export function StatusBadge({
  status,
  size,
  className,
  showDot = true,
  children
}: StatusBadgeProps) {
  const dotColors: Record<string, string> = {
    draft: "bg-[#94a3b8]",
    pending: "bg-amber-500",
    processing: "bg-blue-500 animate-pulse-soft",
    complete: "bg-[#00cc6a]",
    error: "bg-red-500",
  }

  return (
    <span className={cn(statusBadgeVariants({ status, size }), className)}>
      {showDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[status || "draft"])} />
      )}
      {children}
    </span>
  )
}
