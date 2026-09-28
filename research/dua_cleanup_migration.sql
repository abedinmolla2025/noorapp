-- ============================================================
-- NOOR APP — DUA VIRTUE CLEANUP MIGRATION (PROPOSAL ONLY)
-- Generated: 2026-09-28
-- Source: research/dua_classification.json (evidence-first classification)
-- DO NOT EXECUTE without human/scholar review of the evidence below.
-- Only deterministic, evidence-backed changes are included:
--   (1) NULL-out of virtue + virtue_reference for 52 D-class records
--       (50 generic-template claims + 2 reference-only anomalies)
--   (2) Citation correction virtue_reference 'Quran 40:60' -> 'Quran 2:222'
--       for 19 A-class records (claim VERIFIED against 2:222)
-- The dua's own source field `reference` is NEVER touched.
-- Render-layer suppression (commit 48a2286) already hides these fields;
-- this migration cleans the underlying data.
-- ============================================================

-- ---------- STATEMENT 1: NULL-out generic template claims ----------
-- BEFORE:   52 records carry virtue text that is unsourced filler
--           (template T8: "This dua reconnects the heart to Allah in moments
--            of need and uncertainty." x50; template T9: empty virtue x2),
--           with virtue_reference duplicating the dua's own `reference`
--           or dangling (the 2 anomalies).
-- PROPOSED: SET virtue = NULL, virtue_reference = NULL for these 52 ids.
-- EVIDENCE: T8 asserts no sourced virtue; the cited references (the dua's
--           own sources, e.g. Surah An-Nahl 16:97, Sahih al-Bukhari 834)
--           were not used to derive any claim — the text is identical across
--           50 unrelated duas. T9 has no claim text at all. Classification D
--           per research/dua_classification.json. The dua's own source in
--           the separate `reference` column is left intact.
UPDATE admin_content
SET virtue = NULL,
    virtue_reference = NULL,
    updated_at = now()
WHERE id IN (
  'd7bc554e-2cc0-4bc1-9b1b-5f025bcb36a7',
  'b7fbd01f-c2ac-42ae-80e9-367bfd71f73e',
  'd36d6ba2-0496-4d20-ad35-e792693fccb6',
  '71a16d4e-a5b8-4248-ab0c-64f5d6b66541',
  'f8bc5728-114a-4266-a5f0-5a3804b8cfe8',
  '23470e43-9663-4b65-a768-bf6efdc7a91a',
  '5b883ca5-9b52-405e-b4c0-ee9b6748dfc7',
  '16f28494-6a1b-42d6-be10-5f0ff2018b18',
  'd6fa449a-a8ca-4019-b8e8-f37901242bbd',
  'be5ae1c8-de55-4add-ad59-03f3beb8833f',
  'a9315090-3ccb-4f1d-9ea3-207277680b60',
  'a0390e57-8592-40f5-873e-8cdbae21b0f2',
  'b49d5c42-999a-4d89-806f-2e74f79b7519',
  'dd24f2fa-2595-46e7-b1b2-0a7a818c6054',
  '5b31df6f-e6ae-4bb6-9797-c46b3d9044af',
  'b925b706-f65a-4800-b82f-d01f61780481',
  'a16ef8d3-4816-4e97-bd02-07ff7d534b5d',
  'f9944461-9914-4dcc-ad9d-1a7bdab3cda0',
  '461c0df0-4adb-4a9d-bb98-41aaa424c955',
  'f9779769-83d0-4511-80c1-5576ccd3ee0a',
  '38db978c-7a11-4846-a836-5cf66ab041b0',
  'a20364a6-94e7-4c06-8020-28edc977de42',
  '28c321c5-44e0-45c4-8eeb-47fe6c6309dd',
  '4d71f2a9-db90-49e7-87a8-b1d2111a36bc',
  'a235fce3-c370-4abd-8b8e-fa91c49a5c7f',
  '7622f845-6d58-4c1d-bb83-1d75e994dac1',
  '846c9a55-ad65-4aaa-866d-46b6c73e395a',
  '095bc93f-a1be-4d56-a56c-5a95211fad62',
  '59497fba-5781-4deb-a505-47fde9487b3b',
  '66d498a0-0a35-411e-adca-9c6714e5ef22',
  'b7ea4fff-2fc5-4698-bb7e-d289a245a481',
  '078257aa-e2e2-41fd-bcb7-146bbe3867f9',
  '1fa4542a-d3bc-4998-8e6b-e027f1a6d459',
  'b9a9b667-533d-41f1-9097-97862a277b83',
  '91b92ec4-0316-48fc-aa81-56eba00451d2',
  '722ac39b-46c6-4c92-a67d-97d48a53f5a5',
  'a74d5a8e-8151-4e53-a0f8-d394dad8174a',
  '598fb8eb-64dd-4b6c-b77d-a94793a6d5d2',
  '5d7f98cc-de79-4ebe-b222-f5a47b2f31a1',
  '4abcdb0e-4ded-4993-bd2f-ed6e7662a577',
  'b826bc62-efaf-4cf8-bf25-623b809f9114',
  'ce7051c1-7202-497f-a61a-be3027bf3978',
  'b2efa46c-76d6-4a08-a840-83f97dd3e9d0',
  'f93ee306-2310-4f0e-a577-5054ffa582fe',
  '93269f0c-86c5-4bc6-a31a-1426fc41b33d',
  '7a2ee912-c901-4eb1-9b86-b4dc302d9338',
  '9ae38347-f307-4722-b381-4c2a2928f735',
  'ebb65760-31c5-4639-95fb-55c92caed481',
  '48d5896b-991a-4c19-a3b6-4e8796092b23',
  '637bd629-346e-4f05-8fe9-1d27cf6a2f21',
  '264e280c-1ef2-4b50-b564-4e8faab0b9a9',
  'fd5f475a-92b6-4d9b-bbf6-708a6a4adc54'
);

-- ---------- STATEMENT 2: correct the citation for VERIFIED claims ----------
-- BEFORE:   19 records (template T3) carry the claim
--           "Allah loves those who repent and return to Him sincerely."
--           cited as "Quran 40:60".
-- PROPOSED: SET virtue_reference = 'Quran 2:222' (virtue text UNCHANGED).
-- EVIDENCE: The claim is VERIFIED against Quran 2:222 by two independent
--           sources, no conflicts:
--           (1) quran.com/2:222 — "Surely Allah loves those who always turn
--               to Him in repentance and those who purify themselves."
--           (2) Pickthall translation via quranx.com/2.222 —
--               "Truly Allah loveth those who turn unto Him, and loveth
--               those who have a care for cleanness."
--           Quran 40:60 ("Call upon Me, I will respond to you...") says
--           nothing about Allah loving the repentant, so the old citation
--           was wrong. Citation style matches the existing 'Quran 40:60'
--           format.
UPDATE admin_content
SET virtue_reference = 'Quran 2:222',
    updated_at = now()
WHERE id IN (
  'ebd57353-3ec5-4c53-ace5-1d207293cbe9',
  '410d0063-13de-4541-bc2b-c0cb100ac7cf',
  'e7e6577f-f87d-4302-833a-2e423602627a',
  'e667af42-e8ad-4c14-92d5-1e040c4ae264',
  '871ac1fc-bbd6-4d86-be5c-7d081e548504',
  '261dcc6e-92bd-4c01-814c-0c8ec6ee7fee',
  'a5d57cf3-c593-40e2-b3fa-9f419725f039',
  'd92c7c12-1c8c-43fe-ad91-9fedafe9878d',
  '05c43c0b-64e7-4ac3-b627-2593d7fc45f4',
  'ea031f37-a4ee-4a90-9a95-8a20186711db',
  'b9b2c912-1a87-4d1a-aaae-b40c06943cef',
  'f59b717f-9588-466e-80f8-f4f84033c009',
  '1e132200-0347-4761-9816-5bd8e522f64d',
  '835edbb9-43db-4afe-8f22-641bc1af0c93',
  'ab2d11af-87ab-46c8-a8da-3273d22d5769',
  '4ca60df9-9b5e-4e8e-ba31-0ac775f35e18',
  '85d51414-8acd-4e91-9579-f723f115e5fc',
  'd5a70775-1ee9-45ef-b6d2-4603dbee1819',
  '02f99328-c24d-47af-80b5-d055449314eb'
)
AND virtue_reference = 'Quran 40:60';

-- ============================================================
-- VERIFICATION (run after execution, in a privileged session)
-- ============================================================
-- -- expect 0:
-- SELECT count(*) FROM admin_content
-- WHERE content_type = 'dua'
--   AND virtue = 'This dua reconnects the heart to Allah in moments of need and uncertainty.';
-- -- expect 0 (no dangling 40:60 on empty virtue):
-- SELECT count(*) FROM admin_content
-- WHERE content_type = 'dua'
--   AND (virtue IS NULL OR virtue = '')
--   AND virtue_reference = 'Quran 40:60';
-- -- expect 19:
-- SELECT count(*) FROM admin_content
-- WHERE content_type = 'dua'
--   AND virtue = 'Allah loves those who repent and return to Him sincerely.'
--   AND virtue_reference = 'Quran 2:222';
-- -- dua's own source column must be untouched (expect 0 changed):
-- SELECT count(*) FROM admin_content
-- WHERE content_type = 'dua'
--   AND reference IS NULL;
