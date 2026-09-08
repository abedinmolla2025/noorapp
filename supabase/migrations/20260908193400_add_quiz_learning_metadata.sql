-- Add editorial learning metadata to quiz questions.
-- These fields are nullable so existing production questions remain readable
-- while editors progressively add verified explanations and references.
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS explanation_bn TEXT,
  ADD COLUMN IF NOT EXISTS explanation_en TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS related_url TEXT;

COMMENT ON COLUMN public.quiz_questions.explanation_bn IS 'Verified Bengali explanation of why the correct answer is correct.';
COMMENT ON COLUMN public.quiz_questions.explanation_en IS 'Verified English explanation of why the correct answer is correct.';
COMMENT ON COLUMN public.quiz_questions.source_reference IS 'Source, collection, reference number, edition, or translator note.';
COMMENT ON COLUMN public.quiz_questions.related_url IS 'Internal Noor learning URL related to this question.';
