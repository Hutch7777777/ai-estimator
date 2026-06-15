'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action in the destructive variant. */
  destructive?: boolean;
}

/**
 * Promise-based confirmation dialog built on the existing shadcn Dialog —
 * a drop-in replacement for native window.confirm() that preserves the
 * `if (await confirm(...))` call shape.
 *
 * Destructive semantics: the close "X" is hidden and Cancel is the first
 * focusable element, so Radix puts default focus on Cancel; the confirm
 * button uses the destructive variant when `destructive` is set. Closing via
 * overlay/Esc resolves false (the safe default).
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   const ok = await confirm({ title: 'Delete?', destructive: true });
 *   if (!ok) return;
 *   // ...render {confirmDialog} once in the component's JSX.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setOpen(false);
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const confirmDialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && (
            <DialogDescription>{options.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          {/* Cancel first → Radix focuses it on open (default focus on Cancel). */}
          <Button variant="outline" onClick={() => settle(false)}>
            {options?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={options?.destructive ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
