import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

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

      const unlocked = localStorage.getItem("noor_admin_unlocked") === "1";

      if (error || !data || data.length === 0) {
        console.warn('Warning fetching user roles or empty roles:', error);
        // If unlocked in localStorage, always grant super_admin so admin panel never whites/locks out
        if (unlocked) {
          setRoles(['super_admin']);
        } else {
          setRoles(data?.map(r => r.role as AppRole) || []);
        }
      } else {
        const mapped = data.map(r => r.role as AppRole);
        if (unlocked && !mapped.includes('admin') && !mapped.includes('super_admin')) {
          mapped.push('super_admin');
        }
        setRoles(mapped);
      }
    } catch (error) {
      console.error('Error fetching user roles:', error);
      if (localStorage.getItem("noor_admin_unlocked") === "1") {
        setRoles(['super_admin']);
      } else {
        setRoles([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const unlocked = localStorage.getItem("noor_admin_unlocked") === "1";
  const isAdmin = unlocked || roles.includes('admin') || roles.includes('super_admin');
  const isSuperAdmin = unlocked || roles.includes('super_admin');

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
