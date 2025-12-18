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
      "relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-soft",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 font-heading">{value}</p>
          {description && (
            <p className="text-sm text-slate-500">{description}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 pt-1">
              <span className={cn(
                "text-xs font-medium",
                trend.value >= 0 ? "text-brand-600" : "text-red-600"
              )}>
                {trend.value >= 0 ? "+" : ""}{trend.value}%
              </span>
              <span className="text-xs text-slate-400">{trend.label}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="rounded-lg bg-brand-50 p-2.5">
            <Icon className="h-5 w-5 text-brand-600" />
          </div>
        )}
      </div>
    </div>
  )
}
