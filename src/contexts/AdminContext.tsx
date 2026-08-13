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
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchUserRoles(session.user.id);
      } else {
        setLoading(false);
      }
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      // Keep protected routes in a loading state until the role query finishes.
      // Without this, SIGNED_IN can render with stale roles=[] and redirect
      // the freshly unlocked admin back to the homepage.
      setLoading(true);
      setUser(session?.user ?? null);

      if (session?.user) {
        setRoles([]);
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

      if (error) {
        console.error('Error fetching user roles:', error);
        setRoles([]);
      } else {
        setRoles(data?.map(r => r.role as AppRole) || []);
      }
    } catch (error) {
      console.error('Error fetching user roles:', error);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = roles.includes('admin') || roles.includes('super_admin');
  const isSuperAdmin = roles.includes('super_admin');

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
