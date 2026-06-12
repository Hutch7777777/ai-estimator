import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

/**
 * The ONE status badge (Plan Room identity P3) — replaces the previous
 * per-surface badge vocabularies. Pill-shaped, soft tinted fill with dark
 * same-family text, three tones only:
 *   done    — brand 14% tint + dark-green ink (complete / approved / won)
 *   neutral — ink 7% tint + ink (pending, processing, reviewed, everything else)
 *   failed  — redline 10% tint + redline
 * Pass a raw `status` string and the tone resolves via toneForStatus, or
 * force a `tone` explicitly.
 */

export type StatusTone = "done" | "neutral" | "failed"

const DONE_STATUSES = new Set([
  "complete", "completed", "approved", "won", "sent_to_client", "done", "success", "saved",
])
const FAILED_STATUSES = new Set(["failed", "error", "lost", "rejected"])

export function toneForStatus(status?: string | null): StatusTone {
  const s = (status || "").toLowerCase()
  if (DONE_STATUSES.has(s)) return "done"
  if (FAILED_STATUSES.has(s)) return "failed"
  return "neutral"
}

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors",
  {
    variants: {
      tone: {
        done: "bg-brand/[0.14] text-brand-foreground",
        neutral: "bg-ink/[0.07] text-ink",
        failed: "bg-redline/10 text-redline",
      },
      size: {
        sm: "text-[10px] px-2 py-0.5",
        md: "text-xs px-2.5 py-0.5",
        lg: "text-sm px-3 py-1",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  }
)

const DOT_CLASSES: Record<StatusTone, string> = {
  done: "bg-brand",
  neutral: "bg-ink/60",
  failed: "bg-redline",
}

interface StatusBadgeProps extends Omit<VariantProps<typeof statusBadgeVariants>, "tone"> {
  /** Raw status string — tone resolves via toneForStatus. */
  status?: string | null
  /** Explicit tone override. */
  tone?: StatusTone
  className?: string
  showDot?: boolean
  children: React.ReactNode
}

export function StatusBadge({
  status,
  tone,
  size,
  className,
  showDot = true,
  children,
}: StatusBadgeProps) {
  const resolved = tone ?? toneForStatus(status)

  return (
    <span className={cn(statusBadgeVariants({ tone: resolved, size }), className)}>
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASSES[resolved])} />}
      {children}
    </span>
  )
}
