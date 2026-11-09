import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { RefreshCw, BellRing, History, Play, Trash2, Eye, CalendarPlus, ToggleLeft, ToggleRight, Search, X } from "lucide-react";
import StoryPickerPanel, { type ContentPickerItem } from "@/components/admin/StoryPickerPanel";

/* ------------------------------------------------------------------
 * AdminSchedulers — automated scheduled push notification manager.
 * Route: /admin/scheduler (list) + dialog for create/edit.
 * ------------------------------------------------------------------ */

interface Schedule {
  id: string;
  name: string;
  kind: "one_time" | "daily" | "weekly" | "monthly" | "islamic_event";
  time_at: string; // HH:MM
  weekdays: number[];
  day_of_month: number | null;
  tz: string;
  islamic_event: string | null;
  event_date: string | null;
  enabled: boolean;
  target: "all" | "web" | "android";
  title_override: string | null;
  body_override: string | null;
  content_auto: boolean;
  content_type: string | null;
  content_id: string | null;
  created_at: string;
  last_sent_at: string | null;
  next_run_at: string | null;
}

interface RunRow {
  id: string;
  schedule_name: string | null;
  run_at: string;
  content_type: string | null;
  content_title: string | null;
  recipients_total: number;
  recipients_sent: number;
  recipients_failed: number;
  finished_at: string | null;
  error_summary: unknown;
}

const EMPTY: Omit<Schedule, "id" | "created_at" | "last_sent_at" | "next_run_at"> = {
  name: "",
  kind: "daily",
  time_at: "07:00",
  weekdays: [],
  day_of_month: 1,
  tz: "Asia/Kolkata",
  islamic_event: null,
  event_date: null,
  enabled: true,
  target: "all",
  title_override: null,
  body_override: null,
  content_auto: true,
  content_type: null,
  content_id: null,
};

const KIND_LABEL: Record<Schedule["kind"], string> = {
  one_time: "একবার (One-time)",
  daily: "প্রতিদিন (Daily)",
  weekly: "সাপ্তাহিক (Weekly)",
  monthly: "মাসিক (Monthly)",
  islamic_event: "ইসলামিক ইভেন্ট",
};

const EVENT_OPTIONS = [
  { value: "jumuah", label: "জুম্মা (Jumu'ah)" },
  { value: "ramadan_sehri", label: "রমজান — সেহরি" },
  { value: "ramadan_iftar", label: "রমজান — ইফতার" },
  { value: "eid_ul_fitr", label: "ঈদুল ফিতর" },
  { value: "eid_ul_adha", label: "ঈদুল আজহা" },
];

const WEEKDAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"];

function fmtTime(t: string | null): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

export default function AdminSchedulers() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Schedule> | null>(null);
  const [previewOpen, setPreviewOpen] = useState<Schedule | null>(null);
  const [previewCopy, setPreviewCopy] = useState<{ title: string; body: string } | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sRes, rRes] = await Promise.all([
      supabase.from("scheduler_schedules").select("*").order("created_at", { ascending: false }),
      supabase.from("scheduler_notification_runs").select("*").order("run_at", { ascending: false }).limit(200),
    ]);
    if (!sRes.error) setSchedules((sRes.data ?? []) as Schedule[]);
    if (!rRes.error) setRuns((rRes.data ?? []) as RunRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (data: Omit<Schedule, "id" | "created_at" | "last_sent_at" | "next_run_at"> & { id?: string }) => {
    const payload = {
      ...data,
      time_at: `${data.time_at}:00`,
      event_date: data.kind === "one_time" ? data.event_date : null,
      weekdays: data.kind === "weekly" ? data.weekdays : [],
      day_of_month: data.kind === "monthly" ? data.day_of_month : null,
    };
    let res;
    if (data.id) {
      res = await supabase.from("scheduler_schedules").update(payload).eq("id", data.id).select().single();
    } else {
      res = await supabase.from("scheduler_schedules").insert(payload).select().single();
    }
    if (res.error) {
      toast.error(`সেভ ব্যর্থ: ${res.error.message}`);
      return;
    }
    // compute next_run_at via the db helper (client can't run PL/pgSQL)
    if (payload.enabled) {
      const next = await supabase.rpc("scheduler_compute_next_run", {
        s: { ...payload, id: data.id ?? (res.data as any)?.id ?? "" },
        from_tz: payload.tz,
      } as never);
      if (!next.error && next.data) {
        await supabase.from("scheduler_schedules").update({ next_run_at: next.data as string }).eq("id", data.id ?? (res.data as any)?.id);
      }
    }
    toast.success(data.id ? "সাচুল আপডেট হয়েছে" : "নতুন সাচুল তৈরি হয়েছে");
    setDialogOpen(false);
    setEditing(null);
    load();
  }, [load]);

  const toggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    const { error } = await supabase.from("scheduler_schedules").update({ enabled, next_run_at: enabled ? null : null }).eq("id", id);
    if (error) {
      toast.error(`অ্যাকটিভেট ব্যর্থ: ${error.message}`);
      return;
    }
    if (enabled) {
      const { data: s } = await supabase.from("scheduler_schedules").select("*").eq("id", id).maybeSingle();
      if (s) {
        const next = await supabase.rpc("scheduler_compute_next_run", { s: s as never, from_tz: (s as Schedule).tz } as never);
        if (!next.error && next.data) {
          await supabase.from("scheduler_schedules").update({ next_run_at: next.data as string }).eq("id", id);
        }
      }
    }
    toast.success(enabled ? "সাচুল চালু করা হয়েছে" : "সাচুল বন্ধ করা হয়েছে");
    load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    if (!confirm("এই সাচুলটি মুছে ফেলতে চান?")) return;
    const { error } = await supabase.from("scheduler_schedules").delete().eq("id", id);
    if (error) toast.error(`মুছা ব্যর্থ: ${error.error ?? error.message}`);
    else {
      toast.success("সাচুল মুছে ফেলা হয়েছে");
      load();
    }
  }, [load]);

  const testSend = useCallback(async (id: string) => {
    setSending(id);
    try {
      const res = await supabase.functions.invoke("scheduler-dispatch", {
        body: { schedule_id: id },
      });
      if (res.error) {
        toast.error(`পাঠানো ব্যর্থ: ${res.error.message}`);
        return;
      }
      const data = res.data as { total?: number; sent?: number; failed?: number; copy?: { title: string; body: string } };
      toast.success(`পাঠানো শেষ — ${data.sent ?? 0} টি সেন্ট, ${data.failed ?? 0} টি ফেইল (${data.total ?? 0} টি টার্গেট)`);
      setPreviewCopy(data.copy ?? null);
      load();
    } finally {
      setSending(null);
    }
  }, [load]);

  const analytics = useMemo(() => {
    const perSchedule = new Map<string, { sent: number; failed: number; runs: number }>();
    for (const r of runs) {
      const key = r.schedule_name ?? "deleted";
      const agg = perSchedule.get(key) ?? { sent: 0, failed: 0, runs: 0 };
      agg.sent += r.recipients_sent;
      agg.failed += r.recipients_failed;
      agg.runs += 1;
      perSchedule.set(key, agg);
    }
    return perSchedule;
  }, [runs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🕐 সাচুলড পাশ নোটিফিকেশন</h1>
          <p className="text-sm text-muted-foreground">
            অটোমেটিকভাবে পাঠানো হবে — এডমিন প্যানেল থেকে কিছু করার দরকার নেই। সময় অঞ্চল: Asia/Kolkata
          </p>
        </div>
        <Button onClick={() => { setEditing({ ...EMPTY }); setDialogOpen(true); }}>
          <CalendarPlus className="mr-2 h-4 w-4" /> নতুন সাচুল
        </Button>
      </div>

      <Tabs defaultValue="schedules">
        <TabsList>
          <TabsTrigger value="schedules"><BellRing className="mr-1 h-4 w-4" /> সাচুলসমূহ</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" /> ইতিহাস</TabsTrigger>
          <TabsTrigger value="analytics">📊 অ্যানালিটিক্স</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="space-y-4">
          {schedules.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                কোনো সাচুল নেই। উপরে "নতুন সাচুল" থেকে তৈরি করুন।
              </CardContent>
            </Card>
          )}
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <Badge variant={s.enabled ? "default" : "secondary"}>{s.enabled ? "চালু" : "বন্ধ"}</Badge>
                    <Badge variant="outline">{KIND_LABEL[s.kind]}</Badge>
                    {s.islamic_event && (
                      <Badge variant="outline">🌙 {EVENT_OPTIONS.find((e) => e.value === s.islamic_event)?.label}</Badge>
                    )}
                    <Badge variant="outline">🎯 {s.target === "all" ? "সবাই" : s.target === "web" ? "ওয়েব" : "অ্যান্ড্রয়েড"}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>⏰ {s.kind === "one_time" ? `${s.event_date} ${fmtTime(s.time_at)}` : fmtTime(s.time_at)} ({s.tz})</span>
                    {s.kind === "weekly" && s.weekdays.length > 0 && <span>📅 {s.weekdays.map((d) => WEEKDAYS[d]).join(", ")}</span>}
                    {s.kind === "monthly" && <span>📅 প্রতি মাসের {s.day_of_month} তারিখ</span>}
                    {s.next_run_at && <span>⏭️ পরের রান: {new Date(s.next_run_at).toLocaleString("bn-BD", { timeZone: "Asia/Kolkata" })}</span>}
                    {s.last_sent_at && <span>✅ শেষ সেন্ট: {new Date(s.last_sent_at).toLocaleString("bn-BD", { timeZone: "Asia/Kolkata" })}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing({ ...s, id: s.id }); setDialogOpen(true); }}>এডিট</Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    setPreviewOpen(s);
                    // PHASE 2 (2026-11-10): Preview is a DRY RUN — { preview: true }
                    // is admin-only and sends NOTHING (no push, no run row).
                    // The old call ({ schedule_id } only) SENT the notification.
                    const res = await supabase.functions.invoke("scheduler-dispatch", { body: { schedule_id: s.id, preview: true } });
                    if (!res.error) {
                      const d = res.data as { copy?: { title: string; body: string }; targets?: number; dryRun?: boolean };
                      setPreviewCopy(d.copy ?? null);
                      if (d.dryRun) toast.success(`প্রিভিউ (ড্রাই-রান) — কিছু পাঠানো হয়নি; টার্গেট: ${d.targets ?? 0} টি`);
                    }
                  }}>
                    <Eye className="mr-1 h-3.5 w-3.5" /> প্রিভিউ
                  </Button>
                  <Button size="sm" variant="outline" disabled={sending === s.id} onClick={() => testSend(s.id)}>
                    {sending === s.id ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />} টেস্ট পাঠান
                  </Button>
                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">{s.enabled ? "On" : "Off"}</span>
                    <Switch checked={s.enabled} onCheckedChange={(checked) => toggleEnabled(s.id, checked)} />
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>সাচুল</TableHead>
                    <TableHead>রান সময়</TableHead>
                    <TableHead>কন্টেন্ট</TableHead>
                    <TableHead>মোট</TableHead>
                    <TableHead>সেন্ট</TableHead>
                    <TableHead>ফেইল</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        এখনো কোনো রান হয়নি। টেস্ট পাঠালে এখানে দেখা যাবে।
                      </TableCell>
                    </TableRow>
                  )}
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.schedule_name ?? "—"}</TableCell>
                      <TableCell>{new Date(r.run_at).toLocaleString("bn-BD", { timeZone: "Asia/Kolkata" })}</TableCell>
                      <TableCell>{r.content_title ? `${r.content_type === "dua" ? "📿" : "📖"} ${r.content_title}` : "—"}</TableCell>
                      <TableCell>{r.recipients_total}</TableCell>
                      <TableCell className="text-green-700">{r.recipients_sent}</TableCell>
                      <TableCell className={r.recipients_failed > 0 ? "text-destructive" : ""}>{r.recipients_failed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {Array.from(analytics.entries()).length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                ডেটা পাওয়া যায়নি — প্রথম রানের পর এখানে পরিসংখ্যান দেখা যাবে।
              </CardContent>
            </Card>
          )}
          {Array.from(analytics.entries()).map(([name, agg]) => (
            <Card key={name}>
              <CardContent className="flex flex-wrap items-center gap-6 py-4">
                <div className="font-semibold">{name}</div>
                <div className="flex gap-6 text-sm">
                  <div>📨 {agg.runs} টি রান</div>
                  <div className="text-green-700">✅ {agg.sent} সেন্ট</div>
                  <div className={agg.failed > 0 ? "text-destructive" : ""}>❌ {agg.failed} ফেইল</div>
                  <div className="text-muted-foreground">
                    সফলতার হার: {agg.sent + agg.failed > 0 ? Math.round((agg.sent / (agg.sent + agg.failed)) * 100) : 0}%
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <ScheduleDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSave={save} />

      <Dialog open={previewOpen !== null} onOpenChange={() => setPreviewOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>প্রিভিউ — {previewOpen?.name}</DialogTitle>
            <DialogDescription>
              এই সাচুল থেকে যেমন notification দেখাবে (সাম্প্রতিক কন্টেন্ট দিয়ে generate করা)
            </DialogDescription>
          </DialogHeader>
          {previewCopy && (
            <div className="space-y-2 rounded-lg border bg-muted p-4">
              <div className="font-semibold">{previewCopy.title}</div>
              <div className="text-sm text-muted-foreground">{previewCopy.body}</div>
            </div>
          )}
          {!previewCopy && (
            <div className="text-sm text-muted-foreground">প্রিভিউ জেনারেট হচ্ছে...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- create / edit dialog ---------------- */
function ScheduleDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Partial<Schedule> | null;
  onSave: (data: Omit<Schedule, "id" | "created_at" | "last_sent_at" | "next_run_at"> & { id?: string }) => void;
}) {
  const [form, setForm] = useState<Partial<Schedule>>({});

  useEffect(() => {
    if (props.open && props.editing) setForm({ ...props.editing });
  }, [props.open, props.editing]);

  const set = <K extends keyof Schedule>(k: K, v: Schedule[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name?.trim()) {
      toast.error("নাম দিন");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(form.time_at ?? "")) {
      toast.error("সময় সঠিক ফরম্যাটে দিন (যেমন 07:00)");
      return;
    }
    props.onSave({
      id: form.id,
      name: form.name!,
      kind: form.kind ?? "daily",
      time_at: form.time_at ?? "07:00",
      weekdays: form.weekdays ?? [],
      day_of_month: form.day_of_month ?? 1,
      tz: form.tz ?? "Asia/Kolkata",
      islamic_event: form.islamic_event,
      event_date: form.event_date,
      enabled: form.enabled ?? true,
      target: (form.target ?? "all") as Schedule["target"],
      title_override: form.title_override ?? null,
      body_override: form.body_override ?? null,
      content_auto: form.content_auto ?? true,
      content_type: form.content_type,
      content_id: form.content_id,
    });
  };

  const isWeekly = form.kind === "weekly";
  const isMonthly = form.kind === "monthly";
  const isOneTime = form.kind === "one_time";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "সাচুল এডিট" : "নতুন সাচুল"}</DialogTitle>
          <DialogDescription>
            টাইমজোন Asia/Kolkata। একটি নোটিফিকেশন অটো generate হয়ে পাঠানো হবে।
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>নাম</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="যেমন: রাতের দোযা" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ধরন</Label>
              <Select value={form.kind ?? "daily"} onValueChange={(v) => set("kind", v as Schedule["kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">প্রতিদিন</SelectItem>
                  <SelectItem value="weekly">সাপ্তাহিক</SelectItem>
                  <SelectItem value="monthly">মাসিক</SelectItem>
                  <SelectItem value="one_time">একবার</SelectItem>
                  <SelectItem value="islamic_event">ইসলামিক ইভেন্ট</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>সময়</Label>
              <Input type="time" value={form.time_at ?? "07:00"} onChange={(e) => set("time_at", e.target.value)} />
            </div>
          </div>
          {isWeekly && (
            <div>
              <Label>বার নির্বাচন করুন</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAYS.map((d, i) => (
                  <Button key={i} size="sm" variant={form.weekdays?.includes(i) ? "default" : "outline"} type="button"
                    onClick={() => {
                      const has = form.weekdays?.includes(i) ?? false;
                      set("weekdays", has ? (form.weekdays ?? []).filter((x) => x !== i) : [...(form.weekdays ?? []), i]);
                    }}>
                    {d}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {isMonthly && (
            <div>
              <Label>মাসের কোন তারিখে</Label>
              <Input type="number" min={1} max={31} value={form.day_of_month ?? 1}
                onChange={(e) => set("day_of_month", parseInt(e.target.value) || 1)} />
            </div>
          )}
          {isOneTime && (
            <div>
              <Label>তারিখ</Label>
              <Input type="date" value={form.event_date ?? ""} onChange={(e) => set("event_date", e.target.value)} />
            </div>
          )}
          {form.kind === "islamic_event" && (
            <div>
              <Label>ইসলামিক ইভেন্ট</Label>
              <Select value={form.islamic_event ?? ""} onValueChange={(v) => set("islamic_event", v)}>
                <SelectTrigger><SelectValue placeholder="ইভেন্ট বেছে নিন" /></SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>টার্গেট</Label>
            <Select value={form.target ?? "all"} onValueChange={(v) => set("target", v as Schedule["target"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সবাই (ওয়েব + অ্যান্ড্রয়েড)</SelectItem>
                <SelectItem value="web">শুধু ওয়েব</SelectItem>
                <SelectItem value="android">শুধু অ্যান্ড্রয়েড</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox checked={form.content_auto ?? true} onCheckedChange={(v) => {
              set("content_auto", v === true);
              if (v === true) set("content_id", null);
            }} id="auto-content" />
            <Label htmlFor="auto-content">অটো কন্টেন্ট বেছে নেওয়া হবে (নতুন দোয়া/গল্প)</Label>
          </div>
          
          {(form.content_auto ?? true) ? (
            <div>
              <Label>অটো কন্টেন্ট টাইপ</Label>
              <Select value={form.content_type ?? "dua"} onValueChange={(v) => set("content_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dua">📿 দোয়া</SelectItem>
                  <SelectItem value="story">📖 কাহিনী</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-dashed p-3 bg-muted/30">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ম্যানুয়াল কন্টেন্ট নির্বাচন</Label>
              
              {form.content_id ? (
                <div className="flex items-center justify-between rounded-md border bg-background p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      {form.content_type === "dua" ? <BellRing className="h-4 w-4 text-primary" /> : <BookOpen className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{form.content_id}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{form.content_type}</p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    set("content_id", null);
                    set("content_type", null);
                  }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">নিচে থেকে একটি গল্প বা দোয়া বেছে নিন। এর ফলে নোটিফিকেশনে সঠিক Deep Link যুক্ত হবে।</p>
              )}
              
              <div className="max-h-[300px] overflow-hidden">
                <StoryPickerPanel onSelect={(item) => {
                  set("content_id", item.id);
                  set("content_type", item.content_type as any);
                  // Optionally auto-fill overrides if empty
                  if (!form.title_override) set("title_override", item.title);
                }} />
              </div>
            </div>
          )}
          <div>
            <Label>টাইটেল ওভাররাইড (খালি রাখলে অটো generate হবে)</Label>
            <Input value={form.title_override ?? ""} onChange={(e) => set("title_override", e.target.value)} placeholder="অটো — ক্লিয়ার করে নিজের টাইটেল দিন" />
          </div>
          <div>
            <Label>বডি ওভাররাইড</Label>
            <Textarea value={form.body_override ?? ""} onChange={(e) => set("body_override", e.target.value)} rows={2} placeholder="অটো — ক্লিয়ার করে নিজের বডি দিন" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>বাতিল</Button>
          <Button onClick={submit}>সেভ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
