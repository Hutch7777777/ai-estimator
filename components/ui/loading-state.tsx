import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  /** Optional label under the spinner, e.g. "Loading detections…". */
  label?: string;
  className?: string;
}

/**
 * Branded full-area loading state: a brand-green spinner with an optional
 * label. Use in place of bare full-screen <Loader2> spinners.
 *
 * `text-brand` matches the Logo mark's brand-glyph usage — this is a glyph,
 * not body text, so the WCAG text-contrast rule does not apply.
 */
export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[40vh] flex-col items-center justify-center gap-3",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}
