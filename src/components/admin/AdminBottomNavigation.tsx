import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, Users, BookOpen, Bell, Settings, LayoutGrid, CalendarDays } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type AdminNavItem = {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  /** Match nested routes (e.g. /admin/content/:id/workflow) */
  matchPrefixes?: string[];
};

const adminNavItems: AdminNavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
    matchPrefixes: ["/admin", "/admin/dashboard"],
  },
  {
    id: "users",
    label: "Users",
    path: "/admin/users",
    icon: <Users className="h-5 w-5" />,
    matchPrefixes: ["/admin/users"],
  },
  {
    id: "content",
    label: "Content",
    path: "/admin/content",
    icon: <BookOpen className="h-5 w-5" />,
    matchPrefixes: ["/admin/content"],
  },
  {
    id: "builder",
    label: "Builder",
    path: "/admin/page-builder",
    icon: <LayoutGrid className="h-5 w-5" />,
    matchPrefixes: ["/admin/page-builder"],
  },
  {
    id: "notifications",
    label: "Alerts",
    path: "/admin/notifications",
    icon: <Bell className="h-5 w-5" />,
    matchPrefixes: ["/admin/notifications"],
  },
  {
    id: "scheduler",
    label: "Scheduler",
    path: "/admin/scheduler",
    icon: <CalendarDays className="h-5 w-5" />,
    matchPrefixes: ["/admin/scheduler"],
  },
  {
    id: "settings",
    label: "Settings",
    path: "/admin/settings",
    icon: <Settings className="h-5 w-5" />,
    matchPrefixes: ["/admin/settings"],
  },
];

function isAdminRoute(pathname: string) {
  return pathname.startsWith("/admin");
}

function isActivePath(pathname: string, item: AdminNavItem) {
  const prefixes = item.matchPrefixes?.length ? item.matchPrefixes : [item.path];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AdminBottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (!isMobile) return null;
  if (!isAdminRoute(location.pathname)) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur"
      aria-label="Admin bottom navigation"
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-1 px-2 pt-2 pb-4">
        {adminNavItems.map((item) => {
          const active = isActivePath(location.pathname, item);

          return (
            <motion.button
              key={item.id}
              onClick={() => navigate(item.path)}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.div
                  layoutId="adminActiveTab"
                  className="absolute top-1 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                />
              )}
              <div className={cn("transition-transform", active && "scale-110")}>{item.icon}</div>
              <span className={active ? "font-semibold" : undefined}>{item.label}</span>
            </motion.button>
          );
        })}
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
