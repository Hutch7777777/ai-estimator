import { cn } from "@/lib/utils";

// Base skeleton with shimmer effect
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[#e2e8f0] relative overflow-hidden",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer",
        "before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

// Text skeleton with realistic line height
export function SkeletonText({
  lines = 1,
  className
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4 w-full",
            i === lines - 1 && lines > 1 && "w-4/5" // Last line slightly shorter
          )}
        />
      ))}
    </div>
  );
}

// Card skeleton
export function SkeletonCard() {
  return (
    <div className="rounded-xl border-2 p-6 space-y-4">
      <Skeleton className="h-6 w-3/4" />
      <SkeletonText lines={3} />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

// Table row skeleton
export function SkeletonTableRow({ columns = 6 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 p-4 border-b">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === 0 ? "w-48" : "w-32"
          )}
        />
      ))}
    </div>
  );
}

// Project card skeleton (for grid view)
export function SkeletonProjectCard() {
  return (
    <div className="rounded-xl border-2 shadow-soft p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex justify-between items-center pt-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// Form field skeleton
export function SkeletonFormField() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

// Stats card skeleton
export function SkeletonStatCard() {
  return (
    <div className="rounded-xl border-2 p-6 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

// Button skeleton
export function SkeletonButton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-10 w-32 rounded-lg", className)} />;
}

// Avatar skeleton
export function SkeletonAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-16 w-16",
  };

  return <Skeleton className={cn("rounded-full", sizeClasses[size])} />;
}

// Badge skeleton
export function SkeletonBadge() {
  return <Skeleton className="h-6 w-16 rounded-full" />;
}

// Icon skeleton
export function SkeletonIcon() {
  return <Skeleton className="h-5 w-5 rounded" />;
}

// Loading list (for product catalogs, etc.)
export function SkeletonList({
  items = 5,
  variant = "simple"
}: {
  items?: number;
  variant?: "simple" | "detailed";
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3",
            variant === "detailed" && "p-4 border rounded-lg"
          )}
        >
          <SkeletonIcon />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            {variant === "detailed" && <Skeleton className="h-3 w-1/2" />}
          </div>
          {variant === "detailed" && <SkeletonBadge />}
        </div>
      ))}
    </div>
  );
}

// Trade configuration section skeleton (for ProductConfigStep)
export function SkeletonTradeSection() {
  return (
    <div className="space-y-6 p-6 border rounded-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-6 w-6 rounded" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonFormField />
        <SkeletonFormField />
        <SkeletonFormField />
        <SkeletonFormField />
      </div>
    </div>
  );
}
