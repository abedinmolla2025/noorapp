import { Navigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { Loader2 } from "lucide-react";
import { isAdminIdleExpired, setLastAdminActivityNow } from "@/lib/adminSecurity";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isAdmin, loading } = useAdmin();

  // ONE SINGLE SOURCE OF TRUTH for admin unlock state
  const unlocked = localStorage.getItem("noor_admin_unlocked") === "1";

  // Sliding inactivity timeout (30 min) for admin panel
  useEffect(() => {
    if (!user || !isAdmin || !unlocked) return;

    const bump = () => setLastAdminActivityNow();
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((evt) => window.addEventListener(evt, bump, { passive: true }));

    const timer = window.setInterval(() => {
      if (isAdminIdleExpired()) {
        // Soft lock: just clear unlock state, don't sign out.
        // Admin can re-enter passcode without losing session entirely.
        localStorage.removeItem("noor_admin_unlocked");
        localStorage.removeItem("noor_admin_last_activity");
        window.location.reload();
      }
    }, 15_000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, bump));
      window.clearInterval(timer);
    };
  }, [user, isAdmin, unlocked]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admin access requires: backend-authenticated admin + local unlock state + not expired
  if (!user || !isAdmin || !unlocked) {
    return <Navigate to="/" replace />;
  }

  if (isAdminIdleExpired()) {
    // Soft lock instead of hard redirect — clear unlock state
    localStorage.removeItem("noor_admin_unlocked");
    localStorage.removeItem("noor_admin_last_activity");
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

