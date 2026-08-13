import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from '@/components/NavLink';
import { useAdmin } from '@/contexts/AdminContext';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  DollarSign,
  Globe,
  History as HistoryIcon,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Settings,
  Shield,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';


type AdminSidebarProps = {
  /** Only used inside the mobile sheet: shows a compact shortcut row */
  showQuickShortcuts?: boolean;
  /** Optional hook for mobile: close the sheet after navigation/logout */
  onNavigate?: () => void;
};

type NavItem = {
  to: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export const AdminSidebar = ({ showQuickShortcuts = false, onNavigate }: AdminSidebarProps) => {
  const { user } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();

  const navRef = useRef<HTMLElement | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onNavigate?.();
    navigate('/');
  };

  const sections: NavSection[] = [
    {
      title: 'Overview',
      items: [{ to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
    },
    {
      title: 'Manage',
      items: [
        { to: '/admin/users', icon: Users, label: 'Users' },
        { to: '/admin/content', icon: BookOpen, label: 'Content' },
        { to: '/admin/quiz', icon: BookOpen, label: 'Quiz Questions' },
        { to: '/admin/occasions', icon: CalendarDays, label: 'Occasions' },
        { to: '/admin/splash-screens', icon: Sparkles, label: 'Splash Screens' },
        { to: '/admin/notifications', icon: Bell, label: 'Send Notification' },
        { to: '/admin/scheduler', icon: CalendarDays, label: 'Scheduler' },
        { to: '/admin/notifications/history', icon: HistoryIcon, label: 'Notification History' },
        { to: '/admin/notifications/diagnostics', icon: Zap, label: 'Notification Diagnostics' },
        
      ],
    },
    {
      title: 'Insights',
      items: [
        { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
        { to: '/admin/audit', icon: Activity, label: 'Audit' },
      ],
    },
    {
      title: "System",
      items: [
        { to: "/admin/page-builder", icon: LayoutGrid, label: "Page Builder" },
        { to: "/admin/layout", icon: LayoutGrid, label: "Layout" },
        { to: "/admin/seo", icon: Globe, label: "SEO" },
        { to: "/admin/ads", icon: DollarSign, label: "Ads" },
        { to: "/admin/finance", icon: DollarSign, label: "Finance" },
        { to: "/admin/settings", icon: Settings, label: "Settings" },
        { to: "/admin/security", icon: Shield, label: "Security" },
      ],
    },
  ];

  const isActivePath = useMemo(() => {
    const pathname = location.pathname;
    return (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  }, [location.pathname]);

  const activeSectionTitle = useMemo(() => {
    return sections.find((s) => s.items.some((i) => isActivePath(i.to)))?.title;
  }, [isActivePath, sections]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((s) => [s.title, s.title === activeSectionTitle])),
  );

  // Keep the active group expanded when route changes
  useEffect(() => {
    if (!activeSectionTitle) return;
    setOpenSections((prev) => ({ ...prev, [activeSectionTitle]: true }));
  }, [activeSectionTitle]);

  // Scroll active item into view inside the scroll area
  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;

    const raf = requestAnimationFrame(() => {
      const activeLink = navEl.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
      if (activeLink) {
        activeLink.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight text-foreground">NOOR Admin</h2>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{user?.email}</p>
          </div>
          <div className="hidden md:flex">
            <Button
              variant="outline"
              size="icon"
              aria-label="Go to Dashboard"
              onClick={() => navigate('/admin/dashboard')}
              className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Zap className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showQuickShortcuts && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Dashboard"
              onClick={() => {
                onNavigate?.();
                navigate('/admin/dashboard');
              }}
            >
              <LayoutDashboard className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Users"
              onClick={() => {
                onNavigate?.();
                navigate('/admin/users');
              }}
            >
              <Users className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Content"
              onClick={() => {
                onNavigate?.();
                navigate('/admin/content');
              }}
            >
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Notifications"
              onClick={() => {
                onNavigate?.();
                navigate('/admin/notifications');
              }}
            >
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-2 py-3">
        <nav ref={navRef} className="space-y-3" aria-label="Admin navigation">
          {sections.map((section) => {
            const isOpen = openSections[section.title] ?? false;
            const isActiveSection = section.title === activeSectionTitle;

            return (
              <Collapsible
                key={section.title}
                open={isOpen}
                onOpenChange={(open) =>
                  setOpenSections((prev) => ({
                    ...prev,
                    [section.title]: open,
                  }))
                }
              >
                <div className="space-y-1">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors",
                        "hover:bg-muted/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isActiveSection ? "bg-muted/60 text-foreground" : "text-muted-foreground",
                      )}
                      aria-label={`${section.title} section`}
                    >
                      <span>{section.title}</span>
                      <ChevronDown
                        className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')}
                      />
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => onNavigate?.()}
                          className={cn(
                            "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors",
                            "hover:bg-muted hover:text-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          )}
                          activeClassName={cn(
                            "bg-muted text-foreground",
                            "before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary",
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t border-border p-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2.5 text-[13px]"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
};
