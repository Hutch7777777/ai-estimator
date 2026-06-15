import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message: string;
  /** Renders a Retry button when provided. */
  onRetry?: () => void;
  /** Renders a "back" link when provided. */
  backHref?: string;
  backLabel?: string;
  className?: string;
}

/**
 * Branded full-area error state with optional Retry and Back actions.
 * Mirrors the project hub's existing error block so screens stay consistent.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  backHref,
  backLabel = "Go back",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[600px] px-4 py-16 text-center space-y-4",
        className
      )}
      role="alert"
    >
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <h1 className="text-xl font-semibold font-heading">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      {(onRetry || backHref) && (
        <div className="flex justify-center gap-2">
          {onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
          {backHref && (
            <Button variant="outline" asChild>
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
