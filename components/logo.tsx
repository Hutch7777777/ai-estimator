import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
  variant?: "full" | "mark"
}

export function Logo({ className, size = "md", variant = "full" }: LogoProps) {
  const sizes = {
    sm: { text: "text-lg", icon: "w-6 h-6", padding: "p-1" },
    md: { text: "text-xl", icon: "w-8 h-8", padding: "p-1.5" },
    lg: { text: "text-2xl", icon: "w-10 h-10", padding: "p-2" }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Logo Mark */}
      <div className={cn(
        "relative flex items-center justify-center rounded-sm bg-[#00cc6a] text-white",
        sizes[size].icon,
        sizes[size].padding
      )}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
          <path
            d="M4 4h12M4 12h8M4 20h12M4 4v16"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="4" r="2" fill="currentColor" />
          <circle cx="14" cy="12" r="2" fill="currentColor" />
          <circle cx="18" cy="20" r="2" fill="currentColor" />
        </svg>
      </div>

      {variant === "full" && (
        <div className={cn("font-mono font-bold tracking-tight", sizes[size].text)}>
          <span className="text-[#0f172a]">ESTIMATE</span>
          <span className="text-[#00cc6a]">.ai</span>
        </div>
      )}
    </div>
  )
}
