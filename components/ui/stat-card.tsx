import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: {
    value: number
    label: string
  }
  className?: string
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className
}: StatCardProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-soft",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#475569]">{title}</p>
          <p className="text-2xl font-bold text-[#0f172a] font-heading">{value}</p>
          {description && (
            <p className="text-sm text-[#475569]">{description}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 pt-1">
              <span className={cn(
                "text-xs font-medium",
                trend.value >= 0 ? "text-[#00cc6a]" : "text-red-600"
              )}>
                {trend.value >= 0 ? "+" : ""}{trend.value}%
              </span>
              <span className="text-xs text-[#94a3b8]">{trend.label}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="rounded-lg bg-[#dcfce7] p-2.5">
            <Icon className="h-5 w-5 text-[#00cc6a]" />
          </div>
        )}
      </div>
    </div>
  )
}
