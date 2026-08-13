import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import {
  Users,
  BookOpen,
  Bell,
  BarChart3,
  Calendar,
  HelpCircle,
  Shield,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import PwaManifestHealthWidget from "@/components/admin/PwaManifestHealthWidget";
import RealtimeAnalyticsWidget from "@/components/admin/RealtimeAnalyticsWidget";

interface DashboardStats {
  totalUsers: number;
  totalContent: number;
  totalNotifications: number;
  totalQuizQuestions: number;
  recentActivity: number;
}

const AdminDashboard = () => {
  const { branding, loading: configLoading } = useGlobalConfig();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);

      const [usersRes, contentRes, notificationsRes, activityRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("admin_content").select("id", { count: "exact", head: true }),
        supabase.from("admin_notifications").select("id", { count: "exact", head: true }),
        supabase
          .from("user_activity")
          .select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      setStats({
        totalUsers: usersRes.count ?? 0,
        totalContent: contentRes.count ?? 0,
        totalNotifications: notificationsRes.count ?? 0,
        totalQuizQuestions: 0,
        recentActivity: activityRes.count ?? 0,
      });
      setLoading(false);
    };

    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">ড্যাশবোর্ড</h1>
        <p className="text-muted-foreground">
          NoorApp এডমিন প্যানেলে স্বাগতম। এখান থেকে আপনি পুরো সিস্টেম পরিচালনা করতে পারবেন।
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">মোট ব্যবহারকারী</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalUsers}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">মোট কন্টেন্ট</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalContent}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">নোটিফিকেশন</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalNotifications}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">সক্রিয় ব্যবহারকারী (২৪ ঘণ্টা)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.recentActivity}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 space-y-4">
          <RealtimeAnalyticsWidget />
        </div>
        <div className="col-span-3 space-y-4">
          <PwaManifestHealthWidget />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
