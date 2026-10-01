import { Navigate } from "react-router-dom";
import React, { useEffect } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { Loader2 } from "lucide-react";
import { isAdminIdleExpired, setLastAdminActivityNow } from "@/lib/adminSecurity";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isAdmin, loading } = useAdmin();

  // UI inactivity marker only; authorization is enforced by the authenticated server role below.
  const unlocked = localStorage.getItem("noor_admin_unlocked") === "1";

  // Sliding inactivity timeout (30 min) for admin panel
  useEffect(() => {
    if (!unlocked || !user || !isAdmin) return;

    const bump = () => setLastAdminActivityNow();
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((evt) => window.addEventListener(evt, bump, { passive: true }));

    const timer = window.setInterval(() => {
      if (isAdminIdleExpired()) {
        localStorage.removeItem("noor_admin_unlocked");
        localStorage.removeItem("noor_admin_last_activity");
        window.location.reload();
      }
    }, 15_000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, bump));
      window.clearInterval(timer);
    };
  }, [unlocked, user, isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (unlocked && isAdminIdleExpired()) {
    localStorage.removeItem("noor_admin_unlocked");
    localStorage.removeItem("noor_admin_last_activity");
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
