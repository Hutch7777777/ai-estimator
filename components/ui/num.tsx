import { cn } from '@/lib/utils';

/**
 * Numeric value wrapper — Plan Room rule: every number in the app renders in
 * IBM Plex Mono with tabular figures so columns of quantities, costs, and
 * dates align. Equivalent to the `.font-num` utility; use whichever fits.
 */
export function Num({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('font-num', className)} {...props}>
      {children}
    </span>
  );
}
