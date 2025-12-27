import { cn } from "@/lib/utils"
import { LucideIcon, FolderOpen } from "lucide-react"
import { Button } from "./button"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#e2e8f0] bg-[#f8fafc]/50 p-12 text-center",
      className
    )}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f1f5f9] mb-4">
        <Icon className="h-6 w-6 text-[#94a3b8]" />
      </div>
      <h3 className="text-lg font-medium text-[#0f172a] mb-1">{title}</h3>
      <p className="text-sm text-[#475569] max-w-sm mb-4">{description}</p>
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
