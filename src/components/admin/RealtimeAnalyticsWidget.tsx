import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Users, MapPin, FileText, Globe, Smartphone } from "lucide-react";

type Visit = {
  id: string;
  session_id: string;
  path: string;
  page_title: string | null;
  referrer_source: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  created_at: string;
};

const WINDOW_MIN = 5;

type Totals = {
  day: { visitors: number; views: number };
  week: { visitors: number; views: number };
  month: { visitors: number; views: number };
  allTime: { visitors: number; views: number };
};

function aggregate<T extends string>(rows: Visit[], key: (v: Visit) => T | null | undefined) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = key(r) || "Unknown";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const RealtimeAnalyticsWidget = () => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);

  // Load day/week/month totals
  useEffect(() => {
    let mounted = true;
    const loadTotals = async () => {
      const now = Date.now();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("page_visits")
        .select("session_id,created_at")
        .gte("created_at", monthAgo)
        .order("created_at", { ascending: false })
        .limit(50000);

      if (!mounted || !data) return;

      const calc = (sinceIso: string) => {
        const cutoff = new Date(sinceIso).getTime();
        const sessions = new Set<string>();
        let views = 0;
        for (const r of data as { session_id: string; created_at: string }[]) {
          if (new Date(r.created_at).getTime() >= cutoff) {
            sessions.add(r.session_id);
            views++;
          }
        }
        return { visitors: sessions.size, views };
      };

      // All-time totals computed server-side via RPC (avoids fetching rows)
      const { data: allTimeRows } = await supabase.rpc("get_analytics_alltime_totals");
      const allTimeRow = Array.isArray(allTimeRows) ? allTimeRows[0] : null;
      const allTimeUnique = Number(allTimeRow?.unique_visitors ?? 0);
      const allTimeViews = Number(allTimeRow?.total_views ?? 0);

      setTotals({
        day: calc(dayAgo),
        week: calc(weekAgo),
        month: calc(monthAgo),
        allTime: { visitors: allTimeUnique, views: allTimeViews },
      });
    };
    loadTotals();
    const interval = setInterval(loadTotals, 60_000); // refresh every minute
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Initial load + sliding window pruning
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("page_visits")
        .select("id,session_id,path,page_title,referrer_source,country,city,device_type,browser,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (mounted) {
        setVisits((data as Visit[]) ?? []);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel("realtime-page-visits")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "page_visits" },
        (payload) => {
          const v = payload.new as Visit;
          setVisits((prev) => [v, ...prev].slice(0, 500));
        },
      )
      .subscribe();

    // Re-render every 10s to update "live now" window + relative times
    const interval = setInterval(() => setTick((t) => t + 1), 10000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const recent = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MIN * 60 * 1000;
    return visits.filter((v) => new Date(v.created_at).getTime() >= cutoff);
    // tick triggers recompute via state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, tick]);

  const liveSessions = useMemo(() => new Set(recent.map((v) => v.session_id)).size, [recent]);
  const totalViews = recent.length;

  const topPages = useMemo(() => aggregate(recent, (v) => v.path), [recent]);
  const topSources = useMemo(() => aggregate(recent, (v) => v.referrer_source), [recent]);
  const topCities = useMemo(
    () => aggregate(recent, (v) => (v.city && v.country ? `${v.city}, ${v.country}` : v.country || v.city)),
    [recent],
  );
  const topDevices = useMemo(() => aggregate(recent, (v) => v.device_type), [recent]);

  // Per-page live sessions
  const livePerPage = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of recent) {
      if (!map.has(v.path)) map.set(v.path, new Set());
      map.get(v.path)!.add(v.session_id);
    }
    return Array.from(map.entries())
      .map(([path, set]) => [path, set.size] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [recent]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Real-time Analytics
          </CardTitle>
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Last {WINDOW_MIN} min
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Day / Week / Month totals */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Today", data: totals?.day },
            { label: "Last 7 days", data: totals?.week },
            { label: "Last 30 days", data: totals?.month },
            { label: "All time", data: totals?.allTime },
          ].map((t) => (
            <div
              key={t.label}
              className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-4"
            >
              <div className="text-xs font-medium text-muted-foreground">{t.label}</div>
              {!totals ? (
                <Skeleton className="mt-2 h-8 w-20" />
              ) : (
                <>
                  <div className="mt-1 text-2xl font-bold">
                    {t.data!.visitors.toLocaleString()}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">unique</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.data!.views.toLocaleString()} page views
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Live Visitors (unique)
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <div className="mt-1 text-3xl font-bold text-primary">{liveSessions}</div>
            )}
            <div className="text-xs text-muted-foreground">
              unique sessions · last {WINDOW_MIN}m
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Unique Today
            </div>
            {!totals ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <div className="mt-1 text-3xl font-bold">{totals.day.visitors.toLocaleString()}</div>
            )}
            <div className="text-xs text-muted-foreground">distinct session_ids · 24h</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Live Page Views
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <div className="mt-1 text-3xl font-bold">{totalViews}</div>
            )}
            <div className="text-xs text-muted-foreground">last {WINDOW_MIN}m</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Active Pages
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <div className="mt-1 text-3xl font-bold">{livePerPage.length}</div>
            )}
            <div className="text-xs text-muted-foreground">pages with live visitors</div>
          </div>
        </div>

        <Tabs defaultValue="pages">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="geo">Geo</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Live visitors per page</div>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : livePerPage.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No active visitors</p>
            ) : (
              <BarList rows={livePerPage} suffix="visitors" icon={<FileText className="h-3.5 w-3.5" />} />
            )}
          </TabsContent>

          <TabsContent value="sources" className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Top traffic sources</div>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : topSources.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <BarList rows={topSources} suffix="visits" icon={<Globe className="h-3.5 w-3.5" />} />
            )}
          </TabsContent>

          <TabsContent value="geo" className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Top locations</div>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : topCities.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <BarList rows={topCities} suffix="visits" icon={<MapPin className="h-3.5 w-3.5" />} />
            )}
          </TabsContent>

          <TabsContent value="devices" className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Devices</div>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : topDevices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <BarList rows={topDevices} suffix="visits" icon={<Smartphone className="h-3.5 w-3.5" />} />
            )}
          </TabsContent>
        </Tabs>

        {/* Live activity feed */}
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Live activity feed</div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2">
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : recent.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Waiting for activity...</p>
            ) : (
              recent.slice(0, 30).map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="truncate font-mono">{v.path}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <span>{v.city || v.country || "—"}</span>
                    <span>·</span>
                    <span>{v.referrer_source || "direct"}</span>
                    <span>·</span>
                    <span>{timeAgo(v.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const BarList = ({
  rows,
  suffix,
  icon,
}: {
  rows: [string, number][];
  suffix: string;
  icon: React.ReactNode;
}) => {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div className="space-y-1.5">
      {rows.map(([label, count]) => (
        <div key={label} className="relative overflow-hidden rounded border bg-card">
          <div
            className="absolute inset-y-0 left-0 bg-primary/10"
            style={{ width: `${(count / max) * 100}%` }}
          />
          <div className="relative flex items-center justify-between px-3 py-1.5 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground">{icon}</span>
              <span className="truncate">{label}</span>
            </div>
            <span className="ml-2 shrink-0 font-medium">
              {count} <span className="text-xs text-muted-foreground">{suffix}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RealtimeAnalyticsWidget;