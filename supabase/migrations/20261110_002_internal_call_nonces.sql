-- Phase 2 / S-3 Option A (2026-11-10): replay-protection store for the
-- dedicated HMAC service-to-service auth between
-- send-prayer-notifications and send-push.
--
-- Table: internal_call_nonces
--   nonce      text PK — the X-Noor-Nonce of one internal call. The PK
--              is the atomic race guard: a replayed nonce fails the
--              insert even if two requests race past the pre-check.
--   caller     text NOT NULL — expected value 'send-prayer-notifications'.
--   created_at timestamptz NOT NULL DEFAULT now().
--   expires_at timestamptz NOT NULL — nonce validity end (call time +
--              300 s window). Rows are never re-used after expiry, but
--              they are NOT auto-deleted: purge expired rows with the
--              owner-run maintenance statement at the bottom (no cron
--              is created by this file).
--
-- RLS: enabled, service-role-only policy (edge functions use the
-- service-role client; no anon/authenticated access).
--
-- This file is a CANDIDATE ONLY. Do NOT run it against production
-- without the Gate 1 backup + the owner approvals (approved plan,
-- verified backup, recovery procedure, explicit authorization).
-- HARD GATE 0 is ACTIVE. No secret value appears in this file.
-- Deploy order: this migration BEFORE the S-3 send-push receiver
-- (which inserts into this table) — see
-- PHASE2-DEPLOYMENT-DEPENDENCY-MAP.md.

create table if not exists public.internal_call_nonces (
  nonce text primary key,
  caller text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.internal_call_nonces is
  'Phase 2 / S-3: replay-protection nonces for HMAC service-to-service calls (send-prayer-notifications -> send-push). One row per internal call; PK insert is the atomic replay guard.';

create index if not exists internal_call_nonces_expires_at_idx
  on public.internal_call_nonces (expires_at);

alter table public.internal_call_nonces enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'internal_call_nonces'
      and policyname = 'Service only'
  ) then
    create policy "Service only" on public.internal_call_nonces
      for all using (auth.role() = 'service_role');
  end if;
end $$;

-- Maintenance (owner-run, as needed; never automatic):
--   delete from public.internal_call_nonces where expires_at < now();
