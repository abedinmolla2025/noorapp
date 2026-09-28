# P0-1 — Required edge-function secrets checklist

Set these in the Supabase dashboard (Project Settings → Edge Functions → Secrets)
or via `supabase secrets set`, then REDEPLOY the gated functions so the fix takes
effect. No secret values are recorded anywhere in this repo.

## Required for the 4 AI-pipeline functions (all now admin-gated)

| Function | Secret | Purpose |
|---|---|---|
| enrich-dua-content | `LOVABLE_API_KEY` | Lovable AI gateway auth (was previously **hardcoded in source** in `generate-dua-seo` and `generate-hadith-seo` — those values must be **rotated in the Lovable dashboard**; the keys already shipped in the public git history) |
| fix-dua-content | `LOVABLE_API_KEY` | same |
| generate-dua-seo | `LOVABLE_API_KEY` | same |
| generate-hadith-seo | `LOVABLE_API_KEY` | same |

If `LOVABLE_API_KEY` is missing, the functions fail closed with HTTP 500
(`"LOVABLE_API_KEY is not configured"`); they never fall back to a baked-in key.

## Required for the additionally gated functions

| Function | Secret | Purpose |
|---|---|---|
| generate-quiz-sfx | `ELEVENLABS_API_KEY` | ElevenLabs SFX generation (already env-based; now admin-gated) |
| notify-search-engines | — (no new secret) | admin-gated only |

## Already expected (unchanged)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — standard,
  already set per function. The anon key is now used to validate admin JWTs;
  the service-role key is only touched after `is_admin` passes.

## Rotation reminder (action needed by the repo owner)

1. Rotate the exposed Lovable AI key in the Lovable dashboard and update
   `LOVABLE_API_KEY` in Supabase secrets.
2. The old key value remains visible in git history (`generate-dua-seo` and
   `generate-hadith-seo` at line 9 of their `index.ts` before this fix).
   Consider rewriting history or at minimum treating the old value as
   compromised. Rotation is what actually kills the exposure.
3. After rotation, redeploy: `supabase functions deploy enrich-dua-content
   fix-dua-content generate-dua-seo generate-hadith-seo notify-search-engines
   generate-quiz-sfx`. **The unauthenticated endpoints stay live until redeployed.**
