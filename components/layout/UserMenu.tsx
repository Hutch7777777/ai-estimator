'use client';

import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUser } from '@/lib/hooks/useUser';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { ChevronDown, Settings, HelpCircle, LogOut, User } from 'lucide-react';

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

export function UserMenu() {
  const { user, profile, signOut } = useUser();
  const { organization } = useOrganization();

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = getInitials(profile?.full_name || user?.user_metadata?.full_name, user?.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 h-10 px-2">
          <div className="h-8 w-8 rounded-full bg-[#dcfce7] flex items-center justify-center text-sm font-medium text-[#00cc6a]">
            {initials}
          </div>
          <div className="hidden sm:flex flex-col items-start text-left">
            <span className="text-sm font-medium text-[#0f172a] truncate max-w-[120px]">{displayName}</span>
            {organization && (
              <span className="text-xs text-[#64748b] truncate max-w-[120px]">{organization.name}</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-[#64748b]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium text-[#0f172a]">{displayName}</p>
            <p className="text-xs text-[#64748b] truncate">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Account Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account?tab=support" className="cursor-pointer">
            <HelpCircle className="mr-2 h-4 w-4" />
            Support
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer text-red-600 focus:text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
