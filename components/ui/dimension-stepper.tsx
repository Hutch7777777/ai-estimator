'use client';

import { cn } from '@/lib/utils';

export interface DimensionStage {
  id: number;
  label: string;
  /** Optional date shown under the line in 9px Plex Mono. */
  date?: string | null;
}

interface DimensionStepperProps {
  stages: DimensionStage[];
  /** 1-based id of the current stage. */
  currentStage: number;
  /** Enables click-through on reached stages (parity with the old Stepper). */
  onStageClick?: (id: number) => void;
  className?: string;
}

/**
 * The Plan Room signature: a stage stepper drawn as an architectural
 * dimension string. Completed spans are solid ink (2px) with tick slashes at
 * each completed stage point; the current span is brand (2px) ending in an
 * open brand circle; future spans are dashed hairlines. Labels sit above in
 * 11px uppercase; stage dates below in 9px mono. 300ms draw-in on mount,
 * disabled under prefers-reduced-motion (see .dimension-span in globals).
 */
export function DimensionStepper({
  stages,
  currentStage,
  onStageClick,
  className,
}: DimensionStepperProps) {
  const n = stages.length;
  if (n < 2) return null;

  const xPercent = (index: number) => (index / (n - 1)) * 100;

  return (
    <div className={cn('relative h-20 select-none', className)} aria-label="Project stages">
      {/* Spans between stage points */}
      {stages.slice(0, -1).map((stage, i) => {
        const left = xPercent(i);
        const width = xPercent(i + 1) - left;
        const spanEndStage = stages[i + 1].id;
        const isCompletedSpan = spanEndStage < currentStage;
        const isCurrentSpan = spanEndStage === currentStage;
        return (
          <div
            key={`span-${stage.id}`}
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: `${left}%`, width: `${width}%` }}
          >
            {isCompletedSpan || isCurrentSpan ? (
              <div
                className={cn(
                  'dimension-span h-0.5 w-full',
                  isCurrentSpan ? 'bg-brand' : 'bg-ink'
                )}
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ) : (
              <div className="w-full border-t border-dashed border-border" />
            )}
          </div>
        );
      })}

      {/* Stage points: tick slashes (completed), open circle (current) */}
      {stages.map((stage, i) => {
        const reached = stage.id <= currentStage;
        const isCurrent = stage.id === currentStage;
        const isCompleted = stage.id < currentStage;
        const clickable = Boolean(onStageClick) && reached;
        const align =
          i === 0 ? 'translate-x-0' : i === n - 1 ? '-translate-x-full' : '-translate-x-1/2';

        return (
          <div key={`point-${stage.id}`}>
            {/* Point marker */}
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${xPercent(i)}%` }}
            >
              {isCurrent ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" className="fill-paper stroke-brand" strokeWidth="2" />
                </svg>
              ) : isCompleted ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <line x1="3.5" y1="10.5" x2="10.5" y2="3.5" className="stroke-ink" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <circle cx="7" cy="7" r="2" className="fill-border" />
                </svg>
              )}
            </div>

            {/* Label above */}
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onStageClick!(stage.id) : undefined}
              className={cn(
                'absolute top-0 text-[11px] font-medium uppercase tracking-[0.05em] whitespace-nowrap',
                align,
                isCurrent ? 'text-foreground' : reached ? 'text-ink' : 'text-muted-foreground',
                clickable ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
              )}
              style={{ left: `${xPercent(i)}%` }}
            >
              {stage.label}
            </button>

            {/* Date below */}
            {stage.date && (
              <span
                className={cn(
                  'absolute bottom-0 font-num text-[9px] text-muted-foreground whitespace-nowrap',
                  align
                )}
                style={{ left: `${xPercent(i)}%` }}
              >
                {stage.date}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
