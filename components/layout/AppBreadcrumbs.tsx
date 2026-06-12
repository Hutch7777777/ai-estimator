'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Crumb {
  label: string;
  href?: string;
}

// Phase A: the projects list doesn't exist yet — point at the current
// dashboard tab. Phase B/D flip this to '/projects'.
const PROJECTS_HREF = '/projects';

// Module-level cache so navigating between a project's pages doesn't refetch
// the same display names.
const nameCache = new Map<string, string>();

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Project → Extraction → Takeoff lineage for nested pages.
 * Display-only: resolves names client-side with a tiny cached lookup and
 * falls back to shortened ids while loading.
 */
export function AppBreadcrumbs() {
  const pathname = usePathname();
  const [names, setNames] = useState<Record<string, string>>({});

  // Resolve the [id]-ish segments present in the current path.
  useEffect(() => {
    const supabase = createClient();
    const wanted: Array<{ key: string; table: 'projects' | 'extraction_jobs' | 'takeoffs'; column: string }> = [];

    const projectMatch = pathname.match(/^\/projects\/([0-9a-f-]{36})/);
    if (projectMatch) wanted.push({ key: projectMatch[1], table: 'projects', column: 'name' });

    const jobMatch =
      pathname.match(/\/(?:extraction|review)\/([0-9a-f-]{36})/) ||
      pathname.match(/^\/dashboard\/extractions\/([0-9a-f-]{36})/);
    if (jobMatch) wanted.push({ key: jobMatch[1], table: 'extraction_jobs', column: 'project_name' });

    const takeoffMatch = pathname.match(/^\/takeoffs\/([0-9a-f-]{36})/) || pathname.match(/\/takeoff\/([0-9a-f-]{36})/);
    if (takeoffMatch) wanted.push({ key: takeoffMatch[1], table: 'takeoffs', column: 'project_name' });

    wanted.forEach(async ({ key, table, column }) => {
      if (nameCache.has(key)) {
        setNames((prev) => ({ ...prev, [key]: nameCache.get(key)! }));
        return;
      }
      const { data } = await supabase.from(table).select(column).eq('id', key).single();
      const value = (data as Record<string, string | null> | null)?.[column];
      if (value) {
        nameCache.set(key, value);
        setNames((prev) => ({ ...prev, [key]: value }));
      }
    });
  }, [pathname]);

  const crumbs = buildCrumbs(pathname, names);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="hover:text-foreground transition-colors truncate">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-foreground font-medium truncate' : 'truncate'}>{crumb.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function buildCrumbs(pathname: string, names: Record<string, string>): Crumb[] {
  const nameOf = (id: string) => names[id] || nameCache.get(id) || shortId(id);

  // Dashboard / settings / tools
  if (pathname === '/project' || pathname === '/dashboard') return [{ label: 'Dashboard' }];
  if (pathname.startsWith('/account')) return [{ label: 'Settings' }];
  if (pathname.startsWith('/tools/cad-markup')) return [{ label: 'Tools' }, { label: 'PDF Markup' }];

  // Classify (legacy namespace until Phase B folds it into review)
  const classifyMatch = pathname.match(/^\/dashboard\/extractions\/([0-9a-f-]{36})\/classify/);
  if (classifyMatch) {
    return [{ label: 'Projects', href: PROJECTS_HREF }, { label: nameOf(classifyMatch[1]) }, { label: 'Classify Pages' }];
  }

  // Standalone takeoff (legacy path until Phase B)
  const takeoffLegacy = pathname.match(/^\/takeoffs\/([0-9a-f-]{36})/);
  if (takeoffLegacy) {
    return [{ label: 'Projects', href: PROJECTS_HREF }, { label: nameOf(takeoffLegacy[1]) }, { label: 'Takeoff' }];
  }

  // /projects/[id](/...)
  const projectMatch = pathname.match(/^\/projects\/([0-9a-f-]{36})(\/.*)?$/);
  if (projectMatch) {
    const [, id, rest = ''] = projectMatch;
    const crumbs: Crumb[] = [
      { label: 'Projects', href: PROJECTS_HREF },
      { label: nameOf(id), href: `/projects/${id}` },
    ];
    if (rest.startsWith('/extraction/') || rest.startsWith('/review/')) {
      crumbs.push({ label: 'Review' });
    } else if (rest.startsWith('/estimate')) {
      crumbs.push({ label: 'Estimate' });
    } else if (rest.startsWith('/takeoff/')) {
      crumbs.push({ label: 'Takeoff' });
    }
    return crumbs;
  }

  if (pathname === '/projects' || pathname === '/projects/new') {
    return pathname === '/projects/new'
      ? [{ label: 'Projects', href: PROJECTS_HREF }, { label: 'New Project' }]
      : [{ label: 'Projects' }];
  }

  return [];
}
