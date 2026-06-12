import { AppAuthGuard } from '@/components/layout/AppAuthGuard';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppBreadcrumbs } from '@/components/layout/AppBreadcrumbs';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

/**
 * Persistent app shell for all authenticated routes (UIUX audit §1.3):
 * auth/org gating once, left sidebar (collapsible to icon rail), and a
 * breadcrumb header carrying the Project → Review → Takeoff lineage.
 * Canvas-heavy segments render <SidebarAutoCollapse /> to start collapsed.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppAuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <AppBreadcrumbs />
          </header>
          <div className="flex-1 min-w-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AppAuthGuard>
  );
}
