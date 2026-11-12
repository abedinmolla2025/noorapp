/**
 * RecommendationReview — admin review and approval workflow (Phase 7).
 *
 * Mounted on /admin/daily-content. The admin asks the AI to rank today's
 * eligible content (the request is built in the browser from the Phase 4
 * calendar engine + Phase 6 chapter mapping), reviews the ranked references
 * with their verbatim record text, and approves or rejects the run.
 *
 * Safety rules, visible in the UI:
 * - The AI returns REFERENCES + a short ranking rationale ("AI-এর পরামর্শ").
 *   The rationale is the AI's reason for ranking the record here — never a
 *   religious claim, grade, virtue, or ruling. It is labeled as such.
 * - Record text is fetched from the database and shown VERBATIM; the AI
 *   never supplies religious text.
 * - Approval only STAGES a plan. It never publishes, never sends, never
 *   enables automation. Publication stays separately gated (Phase 9).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { kolkataDateString } from "@/lib/dailyContent/selection";
import { getIslamicContextForKey } from "@/lib/islamicCalendar";
import {
  buildRecommendRequest,
  type RecommendationRun,
  type RecommendResponse,
} from "@/lib/dailyContent/recommendations";

type RecordText = { arabic: string; bengali: string };

async function invokeRecommend(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("recommend-daily-content", { body });
  if (error) throw new Error(error.message);
  return data as unknown;
}

export default function RecommendationReview() {
  const { toast } = useToast();
  const today = useMemo(() => kolkataDateString(new Date()), []);
  const request = useMemo(() => buildRecommendRequest(today, getIslamicContextForKey(today)), [today]);
  const [runs, setRuns] = useState<RecommendationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recordTexts, setRecordTexts] = useState<Record<string, RecordText>>({});
  const [rejectReason, setRejectReason] = useState("");

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeRecommend({ action: "list_pending" });
      setRuns(((data as { items?: RecommendationRun[] }).items ?? []) as RecommendationRun[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pending list লোড হয়নি");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const loadRecordText = useCallback(async (ref: string) => {
    if (recordTexts[ref]) return;
    try {
      if (ref.startsWith("hadith:")) {
        const id = ref.slice("hadith:".length);
        const { data } = await supabase
          .from("hadiths")
          .select("arabic, bengali")
          .eq("id", id)
          .maybeSingle();
        if (data) setRecordTexts((m) => ({ ...m, [ref]: { arabic: data.arabic ?? "", bengali: data.bengali ?? "" } }));
      } else if (ref.startsWith("content:")) {
        const slug = ref.slice("content:".length);
        const { data } = await supabase
          .from("admin_content")
          .select("content_arabic, content")
          .eq("slug", slug)
          .maybeSingle();
        if (data) setRecordTexts((m) => ({ ...m, [ref]: { arabic: data.content_arabic ?? "", bengali: data.content ?? "" } }));
      }
    } catch {
      // Text is a preview convenience; the ref + source line are the review
      // basis. A failed fetch must not block approval or rejection.
    }
  }, [recordTexts]);

  const expand = useCallback((run: RecommendationRun) => {
    setExpandedId((cur) => (cur === run.id ? null : run.id));
    setRejectReason("");
    for (const r of run.recommendations) void loadRecordText(r.ref);
  }, [loadRecordText]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const data = await invokeRecommend({ action: "recommend", save: true, ...request });
      const res = data as RecommendResponse;
      setLastResult(res);
      setError(null);
      toast({
        title: "পরামর্শ সংরক্ষিত হয়েছে",
        description: res.recommendations.length > 0
          ? `${res.recommendations.length}টি সুপারিশ পর্যালোচনার জন্য সংরক্ষিত হয়েছে।`
          : "কোনো ব্যবহারযোগ্য সুপারিশ পাওয়া যায়নি — বাতিলের তালিকা দেখুন।",
      });
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : "পরামর্শ তৈরি হয়নি");
    } finally {
      setGenerating(false);
    }
  }, [request, loadPending, toast]);

  const decide = useCallback(async (run: RecommendationRun, action: "approve" | "reject") => {
    try {
      await invokeRecommend({
        action,
        id: run.id,
        ...(action === "reject" && rejectReason.trim() !== "" ? { reason: rejectReason.trim() } : {}),
      });
      toast({
        title: action === "approve" ? "অনুমোদিত হয়েছে" : "বাতিল হয়েছে",
        description: action === "approve"
          ? "পরিকল্পনা প্রস্তুত হয়েছে — প্রকাশনা আলাদা অনুমোদন ছাড়া হবে না।"
          : "এই পরামর্শ-সেটটি বাতিল হয়েছে।",
      });
      setExpandedId(null);
      await loadPending();
    } catch (e) {
      toast({
        title: action === "approve" ? "অনুমোদন হয়নি" : "বাতিল হয়নি",
        description: e instanceof Error ? e.message : "আবার চেষ্টা করুন",
        variant: "destructive",
      });
    }
  }, [rejectReason, loadPending, toast]);

  const hijriLabel = `${request.context.hijri.year}-${String(request.context.hijri.month).padStart(2, "0")}-${String(request.context.hijri.day).padStart(2, "0")}`;
  const eventLabel = request.context.activeEventSlugs.length > 0
    ? request.context.activeEventSlugs.join(", ")
    : "সাধারণ দিন";

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI পরামর্শ — পর্যালোচনা ও অনুমোদন</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          আজ ({today}) — হিজরি {hijriLabel} ({request.context.confirmation === "calculated" ? "গণনাকৃত" : "নিশ্চিত"}) · {eventLabel}
          {request.chapterIds.length > 0 ? ` · অধ্যায়: ${request.chapterIds.join(", ")}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          AI শুধু বিদ্যমান রেকর্ডের র‍্যাঙ্ক করে — কোনো নতুন আয়াত, হাদিস, ফজিলত বা
          হুকুম তৈরি করে না। অনুমোদন শুধু পরিকল্পনা প্রস্তুত করে; প্রকাশনা বা
          পাঠানো আলাদা অনুমোদন ছাড়া হয় না।
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} disabled={generating}>
            {generating ? "তৈরি হচ্ছে…" : "আজকের পরামর্শ তৈরি করুন"}
          </Button>
          <Button variant="outline" onClick={loadPending} disabled={loading}>
            তালিকা আবার লোড করুন
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {lastResult && (
          <div className="rounded-xl border p-3 space-y-2">
            <p className="text-sm font-semibold">
              সর্বশেষ পরামর্শ {lastResult.persisted ? "(পর্যালোচনার জন্য সংরক্ষিত)" : "(সংরক্ষিত হয়নি)"}
            </p>
            {lastResult.recommendations.map((r) => (
              <div key={r.ref} className="text-sm">
                <span className="font-medium">{r.sourceLine}</span>
                <span className="text-muted-foreground"> · {Math.round(r.relevance * 100)}% · </span>
                <span className="text-muted-foreground">AI-এর পরামর্শ: {r.reasonBn}</span>
              </div>
            ))}
            {lastResult.dropped.length > 0 && (
              <p className="text-xs text-muted-foreground">
                বাতিল: {lastResult.dropped.map((d) => `${d.ref} (${d.reason})`).join("; ")}
              </p>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-semibold mb-2">পর্যালোচনার অপেক্ষায় ({runs.length})</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">পর্যালোচনার অপেক্ষায় কোনো পরামর্শ নেই।</p>
          ) : (
            <ul className="space-y-3">
              {runs.map((run) => (
                <li key={run.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => expand(run)} className="text-sm font-medium underline-offset-2 hover:underline">
                      {run.kolkata_date} · হিজরি {run.hijri_key}
                    </button>
                    <Badge variant="secondary">{run.recommendations.length} সুপারিশ</Badge>
                    <Badge variant="outline">{run.status}</Badge>
                  </div>
                  {expandedId === run.id && (
                    <div className="space-y-3">
                      {run.recommendations.map((r) => (
                        <div key={r.ref} className="text-sm space-y-1 rounded-lg bg-muted p-2">
                          <p><span className="font-medium">{r.sourceLine}</span> · {Math.round(r.relevance * 100)}%</p>
                          <p className="text-muted-foreground">AI-এর পরামর্শ: {r.reasonBn}</p>
                          {recordTexts[r.ref] && (
                            <>
                              <p lang="ar" dir="rtl" className="font-arabic">{recordTexts[r.ref].arabic}</p>
                              <p>{recordTexts[r.ref].bengali}</p>
                            </>
                          )}
                        </div>
                      ))}
                      {run.dropped.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          বাতিল: {run.dropped.map((d) => `${d.ref} (${d.reason})`).join("; ")}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" onClick={() => decide(run, "approve")}>অনুমোদন করুন</Button>
                        <input
                          className="rounded-md border px-2 py-1 text-sm"
                          placeholder="বাতিলের কারণ (ঐচ্ছিক)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <Button size="sm" variant="outline" onClick={() => decide(run, "reject")}>বাতিল করুন</Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
