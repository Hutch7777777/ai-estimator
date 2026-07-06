'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isDevBypassEnabled } from '@/lib/hooks/useOrganization';
import { withTimeout } from '@/lib/utils/withTimeout';

interface Crumb {
  label: string;
  href?: string;
}

// Module-level cache so navigating between a project's pages doesn't refetch
// the same display names. Successful lookups only — failures retry on the
// next navigation.
const nameCache = new Map<string, string>();

const UUID_SEGMENT = '[0-9a-f-]{36}';

/**
 * Project → Review → Takeoff lineage for nested pages.
 * Display-only: resolves names client-side (10s timeout, cached) and falls
 * back to a contextual placeholder — never a raw UUID fragment. Under the
 * dev auth bypass, lookups go through the dev-only service-role API.
 */
export function AppBreadcrumbs() {
  const pathname = usePathname();
  const [names, setNames] = useState<Record<string, string>>({});

  // Resolve the [id] segments present in the current path.
  useEffect(() => {
    const wanted: Array<{ key: string; table: 'projects' | 'extraction_jobs' | 'takeoffs'; column: string }> = [];

    const projectMatch = pathname.match(new RegExp(`^/projects/(${UUID_SEGMENT})`));
    if (projectMatch) wanted.push({ key: projectMatch[1], table: 'projects', column: 'name' });

    const jobMatch = pathname.match(new RegExp(`/review/(${UUID_SEGMENT})`));
    if (jobMatch) wanted.push({ key: jobMatch[1], table: 'extraction_jobs', column: 'project_name' });

    const takeoffMatch = pathname.match(new RegExp(`/takeoff/(${UUID_SEGMENT})`));
    if (takeoffMatch) wanted.push({ key: takeoffMatch[1], table: 'takeoffs', column: 'project_name' });

    wanted.forEach(async ({ key, table, column }) => {
      if (nameCache.has(key)) {
        setNames((prev) => ({ ...prev, [key]: nameCache.get(key)! }));
        return;
      }
      try {
        let value: string | null = null;
        if (isDevBypassEnabled()) {
          const response = await withTimeout(fetch(`/api/dev/org-data?name=${table}:${key}`));
          if (response.ok) value = (await response.json()).name ?? null;
        } else {
          const supabase = createClient();
          const { data } = await withTimeout(
            supabase.from(table).select(column).eq('id', key).maybeSingle()
          );
          value = (data as Record<string, string | null> | null)?.[column] ?? null;
        }
        if (value) {
          nameCache.set(key, value);
          setNames((prev) => ({ ...prev, [key]: value }));
        }
      } catch {
        // Timeout or RLS-empty read: the contextual placeholder stays.
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
  // Contextual placeholder while a name resolves (or when the lookup fails /
  // is RLS-filtered) — never a raw UUID fragment.
  const nameOf = (id: string, placeholder: string) =>
    names[id] || nameCache.get(id) || placeholder;

  if (pathname.startsWith('/dashboard')) return [{ label: 'Dashboard' }];
  if (pathname.startsWith('/assistant')) return [{ label: 'AI Assistant' }];
  if (pathname.startsWith('/account')) return [{ label: 'Settings' }];
  if (pathname.startsWith('/tools/cad-markup')) return [{ label: 'Projects', href: '/projects' }];

  // /projects/[id](/...) — the id segment may be '_' for legacy orphan jobs.
  const projectMatch = pathname.match(new RegExp(`^/projects/(${UUID_SEGMENT}|_)(/.*)?$`));
  if (projectMatch) {
    const [, id, rest = ''] = projectMatch;
    const crumbs: Crumb[] = [{ label: 'Projects', href: '/projects' }];
    if (id === '_') {
      crumbs.push({ label: 'Unassigned import' });
    } else {
      crumbs.push({ label: nameOf(id, 'Project…'), href: `/projects/${id}` });
    }
    if (rest.startsWith('/review/')) {
      crumbs.push({ label: 'Review' });
    } else if (rest.startsWith('/estimate')) {
      crumbs.push({ label: 'Estimate' });
    } else if (rest.startsWith('/takeoff/')) {
      crumbs.push({ label: 'Takeoff' });
    }
    return crumbs;
  }

  if (pathname === '/projects/new') {
    return [{ label: 'Projects', href: '/projects' }, { label: 'New Project' }];
  }
  if (pathname === '/projects') {
    return [{ label: 'Projects' }];
  }

  return [];
}
