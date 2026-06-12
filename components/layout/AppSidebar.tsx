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

export function AppSidebar() {
  const pathname = usePathname();
  const { organization } = useOrganization();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <Logo size="sm" variant="mark" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">
              {organization?.name || 'EstimatePros.ai'}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={item.match.test(pathname)} tooltip={item.title}>
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
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TOOL_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={item.match.test(pathname)} tooltip={item.title}>
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
      <SidebarFooter>
        <div className="flex items-center px-1 py-1 group-data-[collapsible=icon]:justify-center">
          <UserMenu />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
