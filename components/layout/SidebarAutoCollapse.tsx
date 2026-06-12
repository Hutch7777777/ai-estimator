'use client';

import { useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

/**
 * Collapses the app sidebar to icon rail on mount. Rendered by canvas-heavy
 * segments (Detection Editor, takeoff viewer) that need the horizontal room.
 * The user can still expand it manually afterwards.
 */
export function SidebarAutoCollapse() {
  const { setOpen } = useSidebar();

  useEffect(() => {
    setOpen(false);
    // Intentionally no cleanup: navigating to a non-canvas page leaves the
    // rail wherever the user last put it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
