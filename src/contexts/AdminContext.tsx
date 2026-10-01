import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { hasAdminAccess, hasSuperAdminAccess } from "@/lib/adminAccess";

export type AppRole = "user" | "editor" | "admin" | "super_admin";

type AdminContextType = {
  user: User | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
};

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;

        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchUserRoles(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error("Error loading session:", e);
        setLoading(false);
      }
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setLoading(true);
      setUser(session?.user ?? null);

      if (session?.user) {
        void fetchUserRoles(session.user.id);
      } else {
        setRoles([]);
        setLoading(false);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const fetchUserRoles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error || !data) {
        console.warn('Warning fetching user roles or empty roles:', error);
        setRoles([]);
        return;
      }
      setRoles(data.map(r => r.role as AppRole));
    } catch (error) {
      console.error('Error fetching user roles:', error);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = hasAdminAccess(user?.id, roles);
  const isSuperAdmin = hasSuperAdminAccess(user?.id, roles);

  return (
    <AdminContext.Provider
      value={{ user, roles, isAdmin, isSuperAdmin, loading }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdmin must be used within AdminProvider");
  return context;
};
