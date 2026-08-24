import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const QuizQuestionSchema = z
  .object({
    // Base fields (required)
    question: z.string().min(1, "Question cannot be empty"),
    options: z.array(z.string()).length(4, "Must have 4 options"),
    correct_answer: z.number().min(0).max(3),
    category: z.string().min(1, "Category is required"),
    difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
    is_active: z.boolean().optional().default(true),

    // Optional bilingual packs (your uploaded JSON already contains these)
    question_en: z.string().optional(),
    question_bn: z.string().optional(),
    options_en: z.array(z.string()).length(4).optional(),
    options_bn: z.array(z.string()).length(4).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.options_en && q.options_en.length !== 4) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "options_en must have 4 options" });
    }
    if (q.options_bn && q.options_bn.length !== 4) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "options_bn must have 4 options" });
    }
  });

type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

type PreviewStats = {
  total: number;
  valid: number;
  invalid: number;
  duplicates_existing: number;
  duplicates_in_file: number;
};

const STORAGE_KEY = "noor_quiz_questions";

const normalizeKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const deriveQuestionKey = (q: QuizQuestion) => normalizeKey((q.question_en || q.question_bn || q.question).trim());

function getStoredQuestions(): QuizQuestion[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveQuestions(questions: QuizQuestion[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}

export function QuizBulkImportDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [preview, setPreview] = useState<QuizQuestion[]>([]);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = async () => {
    if (preview.length === 0) {
      toast.error("Please preview first");
      return;
    }
    setImporting(true);
    try {
      const rows = preview.map((q, index) => ({
        question: q.question_bn || q.question,
        options: q.options_bn || q.options,
        correct_answer: q.correct_answer,
        category: q.category,
        difficulty: q.difficulty || "medium",
        is_active: q.is_active ?? true,
        question_bn: q.question_bn || q.question,
        question_en: q.question_en || null,
        options_bn: q.options_bn || q.options,
        options_en: q.options_en || null,
        order_index: index,
      }));

      for (let start = 0; start < rows.length; start += 100) {
        const { error } = await supabase.from("quiz_questions").insert(rows.slice(start, start + 100));
        if (error) throw error;
      }

      const skipped = (previewStats?.duplicates_existing ?? 0) + (previewStats?.duplicates_in_file ?? 0);
      toast.success(`Imported ${preview.length} | Skipped duplicates ${skipped}`);
      setIsOpen(false);
      setJsonInput("");
      setPreview([]);
      setPreviewStats(null);
    } catch (error: any) {
      toast.error("Error: " + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handlePreview = async () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const questions = Array.isArray(parsed) ? parsed : [parsed];

      const validated: QuizQuestion[] = questions.map((q, index) => {
        try {
          return QuizQuestionSchema.parse(q);
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new Error(
              `Question #${index + 1}: ${err.errors.map((e) => e.message).join(", ")}`
            );
          }
          throw err;
        }
      });

      const { data: existingRows, error: existingError } = await supabase
        .from("quiz_questions")
        .select("question, question_bn, question_en")
        .limit(500);
      if (existingError) throw existingError;
      const existingKeys = new Set(
        (existingRows || []).map((q: any) => normalizeKey((q.question_en || q.question_bn || q.question || "").trim()))
      );
      const seenInFile = new Set<string>();
      const unique: QuizQuestion[] = [];
      let duplicatesExisting = 0;
      let duplicatesInFile = 0;

      for (const q of validated) {
        const key = deriveQuestionKey(q);
        if (!key) continue;

        if (existingKeys.has(key)) {
          duplicatesExisting += 1;
          continue;
        }

        if (seenInFile.has(key)) {
          duplicatesInFile += 1;
          continue;
        }

        seenInFile.add(key);
        unique.push(q);
      }

      setPreview(unique);
      setPreviewStats({
        total: questions.length,
        valid: unique.length,
        invalid: 0,
        duplicates_existing: duplicatesExisting,
        duplicates_in_file: duplicatesInFile,
      });

      toast.success(
        `Valid ${unique.length} | Duplicates skipped ${duplicatesExisting + duplicatesInFile}`
      );
    } catch (error) {
      if (error instanceof Error) {
        toast.error("JSON Error: " + error.message);
      } else {
        toast.error("Invalid JSON format");
      }
      setPreview([]);
      setPreviewStats(null);
    }
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File is too large (max 10MB)");
        return;
      }
      const text = await file.text();
      // Basic validation before setting
      JSON.parse(text);
      setJsonInput(text);
      setPreview([]);
      setPreviewStats(null);
      toast.success(`Loaded ${file.name}`);
    } catch (e) {
      toast.error("Invalid JSON file");
    } finally {
      // allow re-selecting same file
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExportJson = () => {
    const content = (jsonInput.trim().length ? jsonInput : exampleJson).trim();
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz-questions.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exampleJson = `[
  {
    "question": "How many surahs are in the Quran?",
    "question_en": "How many surahs are in the Quran?",
    "question_bn": "কুরআন কত সূরা নিয়ে গঠিত?",
    "options": ["114", "115", "113", "112"],
    "options_en": ["114", "115", "113", "112"],
    "options_bn": ["১১৪", "১১৫", "১১৩", "১১২"],
    "correct_answer": 0,
    "category": "Quran",
    "difficulty": "easy",
    "is_active": true
  }
]`;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Bulk Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Question Import (JSON)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
          />

          <div className="space-y-2">
            <Label>JSON Format Example:</Label>
            <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
              {exampleJson}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="json-input">Paste JSON data:</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handlePickFile}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import JSON file
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleExportJson}>
                  <Download className="h-4 w-4 mr-2" />
                  Export JSON
                </Button>
              </div>
            </div>
            <Textarea
              id="json-input"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Paste JSON data here..."
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          {preview.length > 0 && (
            <div className="space-y-2">
              <Label>
                Preview ({preview.length} questions)
                {previewStats && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Total: {previewStats.total} • Skipped duplicates:{" "}
                    {previewStats.duplicates_existing + previewStats.duplicates_in_file}
                  </span>
                )}
              </Label>
              <div className="bg-muted p-4 rounded-lg max-h-60 overflow-y-auto space-y-4">
                {preview.map((q, index) => (
                  <div key={index} className="border-b border-border pb-2 last:border-0">
                    <p className="font-semibold">
                      {index + 1}. {q.question}
                    </p>
                    <ul className="text-sm text-muted-foreground ml-4 mt-1">
                      {q.options.map((opt, i) => (
                        <li
                          key={i}
                          className={i === q.correct_answer ? "text-green-600 font-semibold" : ""}
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                          {i === q.correct_answer && " ✓"}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-1">
                      Category: {q.category} | Difficulty: {q.difficulty}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handlePreview}>
              Preview
            </Button>
            <Button
              onClick={handleImport}
              disabled={preview.length === 0 || importing}
            >
              {importing ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
