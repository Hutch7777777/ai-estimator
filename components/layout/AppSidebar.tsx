'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Settings, PencilRuler } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/logo';
import { UserMenu } from '@/components/layout/UserMenu';
import { useOrganization } from '@/lib/hooks/useOrganization';

// Single source of truth for app navigation.
const NAV_ITEMS = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, match: /^\/dashboard/ },
  { title: 'Projects', href: '/projects', icon: FolderOpen, match: /^\/projects/ },
  { title: 'Settings', href: '/account', icon: Settings, match: /^\/account/ },
];

const TOOL_ITEMS = [
  // Legacy/standalone tool — pending the Phase-5 wire-or-delete decision.
  { title: 'PDF Markup', href: '/tools/cad-markup', icon: PencilRuler, match: /^\/tools\/cad-markup/ },
];

// Plan Room sidebar (identity P6): ink chrome, square items with a 2px brand
// left tick when active (no rounded pill), letterspaced graphite group labels.
const MENU_BUTTON_CLASSES =
  'rounded-none border-l-2 border-transparent data-[active=true]:border-brand data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium';

const GROUP_LABEL_CLASSES =
  'text-[10px] font-medium uppercase tracking-[0.08em] text-sidebar-foreground/55';

export function AppSidebar() {
  const pathname = usePathname();
  const { organization } = useOrganization();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <Logo size="sm" variant="mark" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate font-mono text-sm font-bold tracking-tight leading-tight">
              <span className="text-sidebar-foreground">EstimatePros</span>
              <span className="text-brand">.ai</span>
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60 leading-tight">
              {organization?.name || 'Workspace'}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={GROUP_LABEL_CLASSES}>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.match.test(pathname)}
                    tooltip={item.title}
                    className={MENU_BUTTON_CLASSES}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className={GROUP_LABEL_CLASSES}>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TOOL_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.match.test(pathname)}
                    tooltip={item.title}
                    className={MENU_BUTTON_CLASSES}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center px-1 py-1 group-data-[collapsible=icon]:justify-center">
          <UserMenu />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
