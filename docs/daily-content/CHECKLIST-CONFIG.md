# Production Configuration Checklist

Names only. NEVER values. Verify presence and consistency, never
print a secret to prove it exists. Nothing in this checklist has
been verified — every row is a production check for the owner at
launch time (runbook Step 2).

| Component | Required configuration | Verification method |
|---|---|---|
| Vercel endpoint (`api/daily-content-run.ts`, project `noorappold`) | `DAILY_CONTENT_CRON_SECRET` (NEW — same value as the edge var) | Vercel dashboard → project → Settings → Environment Variables: confirm the NAME exists for Production (value hidden). Confirm the endpoint returns 401 without the secret and relays status with it. |
| Vercel endpoint | `SUPABASE_URL` (already present on the project) | Same dashboard check: NAME present for Production. No change needed. |
| Supabase Edge Function (`daily-content`) | `SUPABASE_URL` | Supabase dashboard → Edge Functions → `daily-content` → Secrets: confirm the NAME exists. Standard secret, already used by `scheduler-dispatch`. |
| Supabase Edge Function | `SUPABASE_SERVICE_ROLE_KEY` | Same secrets check: NAME present. Presence only; never reveal the value. |
| Supabase Edge Function (`daily-content`) | `verify_jwt = false` (deployment setting, NOT a secret) | Confirm the setting is present: Supabase dashboard → Edge Functions → `daily-content` → configuration, or the `supabase/config.toml` `[functions.daily-content]` entry / `--verify-jwt=false` deploy flag. Without it, gateway JWT verification rejects the Bearer cron secret before the handler runs. See runbook Step 4. |
| Supabase Edge Function | `DAILY_CONTENT_CRON_SECRET` (same value as the Vercel var) | Same secrets check: NAME present. Cross-check sameness WITHOUT revealing values: an authenticated endpoint call must succeed end-to-end (the endpoint signs with the Vercel var, the edge verifies with its own var); a mismatch surfaces as a 401 from the edge. |
| Push | Existing VAPID public/private pair (`WEBPUSH_VAPID_PUBLIC_KEY`, `WEBPUSH_VAPID_PRIVATE_KEY`) | Supabase secrets check: both NAMEs present. Pair consistency check WITHOUT revealing values: the public key served by the existing `webpush-public-key` function must be the key clients subscribe with, and a test push via the existing `scheduler-dispatch` path (or an already-subscribed device) must still succeed after the daily-content deploy. If the pair were inconsistent, pushes would fail with 401/403 from the push service. |
| Push | VAPID pair reuse (NOT regeneration) | Confirm no new pair was generated during launch preparation. A new pair invalidates every existing browser subscription and requires a fleet-wide re-subscription — it is never part of launch or rollback. |
| Scheduler | Daily schedule: ONE trigger, `30 0 * * *` (00:30 UTC = 06:00 Asia/Kolkata) | Vercel Cron (or Supabase pg_cron) dashboard: confirm exactly ONE daily schedule exists, pointing at `api/daily-content-run` (or the edge function), with the correct expression. Planned schedule only until runbook Step 8 approval. |
| Scheduler | Retry schedule: same endpoint with `retry_only=1`, every 15 minutes | Same dashboard check: confirm the retry schedule's payload is retry-only (body `{ "retry_only": true }` or query `?retry_only=1`) and its secret matches. Planned schedule only until runbook Step 9 approval. |
| Scheduler | No duplicate triggers | Confirm the daily and retry schedules are the ONLY Daily Content triggers. A second daily trigger is harmless (published-date idempotency) but must not exist unexamined. |

Optional, unset in production (defaults apply):

| Setting | Default | Notes |
|---|---|---|
| `DAILY_CONTENT_PUSH_TIMEOUT_MS` | 30,000 ms | Edge-only override for the push timeout (hardening B). Leave unset in production. Only set it if push-provider latency measurements justify a different bound — the edge code clamps values above 300,000 ms to 300,000 ms (at most half the 10-minute lease, leaving margin for timer slop and clock skew). The old 600,000 ms ceiling is NOT a safe setting and is no longer honored as written: a call near the lease boundary could double-send. Default 30,000 ms; invalid values fall back to the default. |
