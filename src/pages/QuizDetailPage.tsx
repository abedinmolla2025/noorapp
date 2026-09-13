import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const SITE_ORIGIN = "https://noorapp.in";
const ELIGIBLE = new Set(["verified", "verified_primary", "verified_secondary"]);

type QuizRecord = {
  id: string;
  category: string | null;
  question_bn: string | null;
  question_en: string | null;
  options_bn: string[] | null;
  options_en: string[] | null;
  correct_answer: number;
  explanation_bn: string | null;
  explanation_en: string | null;
  source_reference: string | null;
  related_url: string | null;
  verification_status: string | null;
};

function QuizJsonLd({ record, url }: { record: QuizRecord; url: string }) {
  const answerBn = record.options_bn?.[record.correct_answer];
  const answerEn = record.options_en?.[record.correct_answer];
  const questionText = [record.question_bn, record.question_en].filter(Boolean).join(" / ");
  const answerText = [answerBn, answerEn].filter(Boolean).join(" / ");
  if (!ELIGIBLE.has(record.verification_status ?? "") || !questionText || !answerText) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Quiz",
    "@id": `${url}#quiz`,
    url,
    name: questionText,
    about: { "@type": "Thing", name: record.category || "Islamic studies" },
    educationalAlignment: [{
      "@type": "AlignmentObject",
      alignmentType: "educationalSubject",
      targetName: `Islamic studies — ${record.category || "General"}`,
    }],
    hasPart: [{
      "@type": "Question",
      eduQuestionType: "Flashcard",
      text: questionText,
      acceptedAnswer: { "@type": "Answer", text: answerText },
    }],
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

export default function QuizDetailPage() {
  const { id } = useParams<{ id: string }>();
  const url = `${SITE_ORIGIN}/quiz/${encodeURIComponent(id || "")}`;
  const { data: record, isLoading, isError } = useQuery({
    queryKey: ["quiz-detail", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<QuizRecord | null> => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("id, category, question_bn, question_en, options_bn, options_en, correct_answer, explanation_bn, explanation_en, source_reference, related_url, verification_status")
        .eq("id", id as string)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data || !ELIGIBLE.has(data.verification_status ?? "")) return null;
      return data as QuizRecord;
    },
    staleTime: 10 * 60 * 1000,
  });

  const title = record ? `${record.question_bn || record.question_en} | Noor Quiz` : "Islamic Quiz | Noor";
  const description = record?.explanation_bn || record?.explanation_en || "Verified Islamic quiz question from Noor.";
  const optionRows = useMemo(() => {
    if (!record) return [];
    const count = Math.max(record.options_bn?.length || 0, record.options_en?.length || 0);
    return Array.from({ length: count }, (_, index) => ({
      bn: record.options_bn?.[index] || record.options_en?.[index] || "",
      en: record.options_en?.[index] || "",
    }));
  }, [record]);

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description.slice(0, 155)} />
        <link rel="canonical" href={url} />
        {(isError || (!isLoading && !record)) && <meta name="robots" content="noindex,follow" />}
        {record && <meta property="og:url" content={url} />}
      </Helmet>
      {record && <QuizJsonLd record={record} url={url} />}
      <main className="min-h-screen bg-background px-4 pb-28 pt-8">
        <div className="mx-auto max-w-3xl">
          <Button asChild variant="ghost" className="mb-4 px-0">
            <Link to="/quiz"><ArrowLeft className="mr-2 h-4 w-4" />Back to Daily Quiz</Link>
          </Button>
          {isLoading && <p className="py-16 text-center text-muted-foreground">কুইজ লোড হচ্ছে...</p>}
          {(isError || (!isLoading && !record)) && (
            <Card><CardContent className="py-16 text-center">
              <h1 className="mb-3 text-xl font-semibold">Quiz question unavailable</h1>
              <p className="mb-6 text-muted-foreground">This question is not published or is awaiting editorial review.</p>
              <Button asChild><Link to="/quiz">Browse the daily quiz</Link></Button>
            </CardContent></Card>
          )}
          {record && (
            <article>
              <Card>
                <CardHeader>
                  <p className="text-sm font-medium text-primary">{record.category || "Islamic studies"}</p>
                  <CardTitle className="text-2xl leading-relaxed">{record.question_bn || record.question_en}</CardTitle>
                  {record.question_en && record.question_bn && <p lang="en" className="text-muted-foreground">{record.question_en}</p>}
                </CardHeader>
                <CardContent className="space-y-6">
                  <ol className="grid gap-3">
                    {optionRows.map((option, index) => (
                      <li key={index} className={`rounded-lg border p-4 ${index === record.correct_answer ? "border-primary bg-primary/10" : ""}`}>
                        <span className="mr-3 font-semibold">{String.fromCharCode(65 + index)}.</span>{option.bn}
                        {option.en && option.en !== option.bn && <span lang="en" className="mt-1 block text-sm text-muted-foreground">{option.en}</span>}
                      </li>
                    ))}
                  </ol>
                  <section aria-labelledby="answer-heading" className="rounded-lg bg-primary/10 p-4">
                    <h2 id="answer-heading" className="mb-2 font-semibold">সঠিক উত্তর / Correct answer</h2>
                    <p>{record.options_bn?.[record.correct_answer] || record.options_en?.[record.correct_answer]}</p>
                    {record.options_en?.[record.correct_answer] && record.options_bn?.[record.correct_answer] && <p lang="en" className="text-sm text-muted-foreground">{record.options_en[record.correct_answer]}</p>}
                  </section>
                  {(record.explanation_bn || record.explanation_en) && <section><h2 className="mb-2 font-semibold">ব্যাখ্যা / Explanation</h2><p>{record.explanation_bn || record.explanation_en}</p>{record.explanation_en && record.explanation_bn && <p lang="en" className="mt-2 text-muted-foreground">{record.explanation_en}</p>}</section>}
                  {record.source_reference && <section><h2 className="mb-2 font-semibold">Source</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground">{record.source_reference}</p></section>}
                  <div className="flex flex-wrap gap-3 border-t pt-4"><Link className="text-sm text-primary hover:underline" to="/sources">Editorial sources and methodology</Link>{record.related_url?.startsWith("/") && <Link className="inline-flex items-center gap-1 text-sm text-primary hover:underline" to={record.related_url}>Related reading <ExternalLink className="h-3 w-3" /></Link>}</div>
                </CardContent>
              </Card>
            </article>
          )}
        </div>
      </main>
    </>
  );
}
