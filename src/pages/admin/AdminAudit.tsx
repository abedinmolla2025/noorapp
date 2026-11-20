import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";

/**
 * Audit Log (Phase 4, M9): reads the real `admin_audit_log` table —
 * newest 50 rows, admin RLS only. Before Phase 4 this page was a
 * static placeholder ("No audit entries found") that never queried
 * the table. Daily-content code still writes ZERO audit rows itself;
 * the first writer is the Facebook approve action
 * (`facebook_approve` in the daily-content edge function), which
 * records its row only when the approver is a real admin profile
 * UUID. This page is read-only: it never writes, approves, or
 * deletes anything. When the table or the admin policy is missing,
 * the query error is shown honestly instead of an empty list.
 */
interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: unknown;
  created_at: string;
}

const FILTERS = [
  { value: "all", label: "All actions" },
  { value: "facebook", label: "Facebook" },
  { value: "security", label: "Security" },
  { value: "daily_content", label: "Daily Content" },
] as const;

function formatKolkata(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });
  } catch {
    return iso;
  }
}

const AdminAuditPage = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("admin_audit_log")
        .select("id, actor_id, action, resource_type, resource_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (f === "facebook") query = query.ilike("action", "%facebook%");
      if (f === "security") query = query.ilike("action", "%security%");
      if (f === "daily_content") query = query.ilike("action", "%daily_content%");
      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setRows((data ?? []) as unknown as AuditRow[]);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Audit log could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminLoading && isAdmin) void load(filter);
  }, [adminLoading, isAdmin, filter, load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-center">
            <label htmlFor="audit-filter" className="text-sm font-semibold">
              Filter:
            </label>
            <select
              id="audit-filter"
              className="border rounded px-2 py-1 text-sm bg-background"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">Newest 50 rows.</span>
          </div>
          {adminLoading || loading ? (
            <p className="text-sm text-muted-foreground">Loading audit log…</p>
          ) : !isAdmin ? (
            <p className="text-sm text-muted-foreground">Admin session required to read the audit log.</p>
          ) : error ? (
            <p className="text-sm text-destructive">Audit log unavailable: {error}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">
              No audit entries found. Daily-content code writes no audit rows yet — the first
              writer is the Facebook approve action.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="border rounded p-3 space-y-1">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge>{r.action}</Badge>
                    <span>{formatKolkata(r.created_at)}</span>
                    <span className="text-muted-foreground">
                      actor: {r.actor_id ? `${r.actor_id.slice(0, 8)}…` : "—"}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {r.resource_type ?? "—"}
                    {r.resource_id ? ` · ${r.resource_id}` : ""}
                  </p>
                  {r.metadata != null && (
                    <details>
                      <summary className="cursor-pointer text-xs">metadata</summary>
                      <pre className="text-xs overflow-auto mt-1">
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuditPage;
