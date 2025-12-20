"use client";

import { Loader2, Check, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "unsaved";

interface SaveStatusProps {
  status: SyncStatus;
  lastSaved?: Date | null;
  error?: string | null;
  className?: string;
}

export function SaveStatus({
  status,
  lastSaved,
  error,
  className,
}: SaveStatusProps) {
  const getStatusDisplay = () => {
    switch (status) {
      case "saving":
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: "Saving...",
          colorClass: "text-blue-600",
        };
      case "saved":
        return {
          icon: <Check className="h-4 w-4" />,
          text: lastSaved ? formatTimeAgo(lastSaved) : "Saved",
          colorClass: "text-green-600",
        };
      case "error":
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          text: error || "Save failed",
          colorClass: "text-red-600",
        };
      case "unsaved":
        return {
          icon: <Clock className="h-4 w-4" />,
          text: "Unsaved changes",
          colorClass: "text-amber-600",
        };
      case "idle":
      default:
        return {
          icon: null,
          text: "",
          colorClass: "text-muted-foreground",
        };
    }
  };

  const { icon, text, colorClass } = getStatusDisplay();

  if (status === "idle") {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-sm",
        colorClass,
        className
      )}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 10) {
    return "Saved just now";
  } else if (diffSeconds < 60) {
    return `Saved ${diffSeconds}s ago`;
  } else if (diffMinutes < 60) {
    return `Saved ${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `Saved ${diffHours}h ago`;
  } else {
    return `Saved on ${date.toLocaleDateString()}`;
  }
}
