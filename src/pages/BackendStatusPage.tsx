import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase, supabasePublic } from "@/integrations/supabase/client";

type CheckStatus = "pending" | "pass" | "fail";

type DiagnosticCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail?: string;
};

const statusBadgeVariant = (status: CheckStatus) => {
  switch (status) {
    case "pass":
      return "default";
    case "fail":
      return "destructive";
    default:
      return "secondary";
  }
};

const statusLabel = (status: CheckStatus) => {
  switch (status) {
    case "pass":
      return "PASS";
    case "fail":
      return "FAIL";
    default:
      return "PENDING";
  }
};

const BackendStatusPage = () => {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [setupRunning, setSetupRunning] = useState<null | "ensure" | "bootstrap_admin">(null);
  const [setupNote, setSetupNote] = useState<string | null>(null);
  const [checks, setChecks] = useState<DiagnosticCheck[]>([
    { key: "auth_session", label: "Auth session available", status: "pending" },
    { key: "auth_user", label: "Auth user fetch", status: "pending" },
    { key: "db_app_settings", label: "DB: app_settings readable", status: "pending" },
    { key: "db_profiles", label: "DB: profiles readable", status: "pending" },
    { key: "db_admin_content", label: "DB: admin_content readable", status: "pending" },
    { key: "db_admin_ads", label: "DB: admin_ads readable", status: "pending" },
    { key: "rls_anon_user_roles", label: "RLS: anon cannot read user_roles", status: "pending" },
    { key: "rls_authed_user_roles", label: "RLS: current user can read own roles", status: "pending" },
    { key: "rpc_is_admin", label: "DB function: is_admin(user)", status: "pending" },
  ]);

  // Reuse the app-wide session-free client to avoid multiple GoTrueClient instances.
  const anonClient = supabasePublic;

  const setCheck = (key: string, patch: Partial<DiagnosticCheck>) => {
    setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const run = async () => {
    setRunning(true);
    // reset
    setChecks((prev) => prev.map((c) => ({ ...c, status: "pending", detail: undefined })));

    try {
      // 1) Auth session
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes.data.session;
      setCheck("auth_session", {
        status: session ? "pass" : "fail",
        detail: session ? `user_id: ${session.user.id}` : "No active session. Log in to test authenticated RLS.",
      });

      // 2) Auth user
      const userRes = await supabase.auth.getUser();
      const user = userRes.data.user;
      setCheck("auth_user", {
        status: user ? "pass" : "fail",
        detail: user ? `email: ${user.email ?? "(no email)"}` : (userRes.error?.message ?? "No user returned"),
      });

      // 3) DB checks (read-only)
      const tableHeadCheck = async (table: "app_settings" | "profiles" | "admin_content" | "admin_ads", key: string) => {
        const { error, count } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .limit(1);

        setCheck(key, {
          status: error ? "fail" : "pass",
          detail: error ? error.message : `ok (rows: ${count ?? "?"})`,
        });
      };

      await Promise.all([
        tableHeadCheck("app_settings", "db_app_settings"),
        tableHeadCheck("profiles", "db_profiles"),
        tableHeadCheck("admin_content", "db_admin_content"),
        tableHeadCheck("admin_ads", "db_admin_ads"),
      ]);

      // 4) RLS check: anon should not read user_roles
      if (!anonClient) {
        setCheck("rls_anon_user_roles", {
          status: "fail",
          detail: "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY env vars.",
        });
      } else {
        const anonRes = await anonClient.from("user_roles").select("role").limit(1);
        // PASS if blocked (error) OR returned 0 rows because no policy exposes data.
        const anonPass = Boolean(anonRes.error) || (Array.isArray(anonRes.data) && anonRes.data.length === 0);
        setCheck("rls_anon_user_roles", {
          status: anonPass ? "pass" : "fail",
          detail: anonRes.error
            ? `blocked (${anonRes.error.message})`
            : `returned ${anonRes.data?.length ?? 0} rows (should be 0)` ,
        });
      }

      // 5) RLS check: authenticated user can read their own role rows
      if (!user) {
        setCheck("rls_authed_user_roles", {
          status: "fail",
          detail: "Not logged in.",
        });
        setCheck("rpc_is_admin", {
          status: "fail",
          detail: "Not logged in.",
        });
      } else {
        const rolesRes = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        setCheck("rls_authed_user_roles", {
          status: rolesRes.error ? "fail" : "pass",
          detail: rolesRes.error
            ? rolesRes.error.message
            : `roles: ${(rolesRes.data ?? []).map((r) => r.role).join(", ") || "(none)"}`,
        });

        const isAdminRes = await supabase.rpc("is_admin", { _user_id: user.id });
        setCheck("rpc_is_admin", {
          status: isAdminRes.error ? "fail" : "pass",
          detail: isAdminRes.error ? isAdminRes.error.message : `is_admin: ${String(isAdminRes.data)}`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // mark all pending as fail with a generic error, but keep already computed ones.
      setChecks((prev) =>
        prev.map((c) =>
          c.status === "pending"
            ? { ...c, status: "fail", detail: `Unexpected error: ${msg}` }
            : c
        )
      );
    } finally {
      setRunning(false);
    }
  };

  const handleEnsureProfileAndRole = async () => {
    setSetupRunning("ensure");
    setSetupNote(null);
    try {
      // Note: ensure_profile_and_user_role function may not exist in database
      const { error } = await (supabase.rpc as any)("ensure_profile_and_user_role");
      if (error) throw error;
      setSetupNote("Profile + default role ensured for current user.");
      await run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSetupNote(`Failed: ${msg}`);
    } finally {
      setSetupRunning(null);
    }
  };

  const handleBootstrapFirstSuperAdmin = async () => {
    setSetupRunning("bootstrap_admin");
    setSetupNote(null);
    try {
      // Note: bootstrap_first_super_admin function may not exist in database
      const { data, error } = await (supabase.rpc as any)("bootstrap_first_super_admin");
      if (error) throw error;
      setSetupNote(
        data === true
          ? "You are now the first super admin for this backend."
          : "A super admin already exists on this backend (no changes made)."
      );
      await run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSetupNote(`Failed: ${msg}`);
    } finally {
      setSetupRunning(null);
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-24 font-bangla">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/admin/security")}
            className="p-2 rounded-full hover:bg-muted/70 border border-border/60 transition-colors"
            aria-label="Back to security"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-wide">Backend Status</h1>
            <p className="text-sm text-muted-foreground">Read-only migration diagnostics</p>
          </div>
          <Button onClick={run} disabled={running} variant="secondary" className="gap-2">
            <RefreshCw className={running ? "animate-spin" : ""} size={16} />
            Run
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card className="bg-card/70 border border-border/60 rounded-2xl shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="font-semibold">Summary</span>
              <div className="flex items-center gap-2">
                {failed === 0 ? (
                  <ShieldCheck className="text-primary" size={18} />
                ) : (
                  <ShieldX className="text-destructive" size={18} />
                )}
                <span className="text-sm text-muted-foreground">
                  {passed} passed • {failed} failed
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              This screen performs non-destructive reads only. If you’re not signed in, authenticated RLS checks will fail by design.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border border-border/60 rounded-2xl shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Setup helpers</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              These buttons are optional and only affect the <span className="font-medium">currently signed-in</span> user.
              They’re useful if roles/profiles didn’t get created during a migration.
            </p>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(setupRunning)}
                onClick={handleEnsureProfileAndRole}
              >
                {setupRunning === "ensure" ? "Working…" : "Ensure my profile + default role"}
              </Button>

              <Button
                type="button"
                variant="destructive"
                disabled={Boolean(setupRunning)}
                onClick={handleBootstrapFirstSuperAdmin}
              >
                {setupRunning === "bootstrap_admin" ? "Working…" : "Become first super admin (one-time)"}
              </Button>
            </div>

            {setupNote ? <p className="text-xs text-muted-foreground break-words">{setupNote}</p> : null}
          </CardContent>
        </Card>

        <Card className="bg-card/70 border border-border/60 rounded-2xl shadow-soft overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Checks</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell>
                      <div className="font-medium">{c.label}</div>
                      {c.detail ? (
                        <>
                          <Separator className="my-2" />
                          <div className="text-xs text-muted-foreground break-words">{c.detail}</div>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(c.status)}>{statusLabel(c.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border border-border/60 rounded-2xl shadow-soft">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Tip: after you connect to your own backend, this helps confirm (1) tables exist, (2) RLS blocks anonymous reads, and (3) your session/roles are working.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default BackendStatusPage;
