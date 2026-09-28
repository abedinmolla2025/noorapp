-- ============================================================================
-- PROPOSAL ONLY — DO NOT EXECUTE without human/editorial review.
-- Noor App quiz C-record fixes VERIFIED by evidence-first research, 2026-09-28.
-- Read-only research artifacts:
--   research/quiz_c_records.json  (full evidence trail per record)
--   research/quiz_c_records.md    (per-record verdict summary)
--
-- Each statement is guarded on the documented BEFORE state (id + current key)
-- so it applies ONLY if the row is still in that state. All statements use
-- dollar-quoting; no identifier or value was invented.
--
-- Bengali strings marked REVIEW-TRANSLATION are direct translations of the
-- verified English fixes and MUST be reviewed by a native Bengali speaker
-- before execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) 9322e182-0aaa-4fee-8907-753bcc5a1970
--     Q: "How many Prophets are mentioned by name in the Quran?"
-- BEFORE:   correct_answer = 0 ("20"); explanation honestly flags the key as
--           unendorsable because the conventional list is 25.
-- PROPOSED: correct_answer = 1 ("25"); explanation states the verified list.
-- EVIDENCE: 25 named prophets VERIFIED by >=2 independent reputable sources:
--   - islamqa.info Q10468 (sourced to Shaykh al-Tuwayjri, Usool al-Deen al-Islami):
--     full 25-name list.
--   - Ulum Al-Azhar Academy: 18 named together in 6:83-86; 7 more elsewhere
--     (Adam 3:33, Hud 11:50, Salih 11:61, Shu'ayb 11:84, Idris & Dhul-Kifl
--     21:85, Muhammad 48:29).
--   - Primary text cross-check: 6:83-86, 21:85, 48:29 via Quranic Arabic Corpus.
--   No reputable source supports 20.
-- ----------------------------------------------------------------------------
UPDATE quiz_questions
SET correct_answer = 1,
    explanation_en = $$The Qur'an names eighteen prophets together in 6:83-86 (Abraham, Isaac, Jacob, Noah, David, Solomon, Job, Joseph, Moses, Aaron, Zechariah, John, Jesus, Elias, Ishmael, Elisha, Jonah, Lot). Seven more are named elsewhere - Adam (3:33), Hud (11:50), Salih (11:61), Shu'ayb (11:84), Idris and Dhul-Kifl (21:85), and Muhammad (48:29) - making twenty-five named prophets in total.$$,
    explanation_bn = $$REVIEW-TRANSLATION: কুরআনে ৬:৮৩-৮৬ আয়াতে একসাথে আঠারোজন নবীর নাম উল্লেখ আছে (ইবরাহীম, ইসহাক, ইয়াকুব, নূহ, দাউদ, সুলাইমান, আইয়ুব, ইউসুফ, মূসা, হারূন, যাকারিয়া, ইয়াহইয়া, ঈসা, ইলিয়াস, ইসমাঈল, আল-ইয়াসা, ইউনুস, লূত)। আরও সাতজন অন্যত্র নামোল্লেখিত — আদম (৩:৩৩), হূদ (১১:৫০), সালিহ (১১:৬১), শুআইব (১১:৮৪), ইদরীস ও যুল-কিফল (২১:৮৫), এবং মুহাম্মাদ (৪৮:২৯) — মোট পঁচিশজন।$$
WHERE id = '9322e182-0aaa-4fee-8907-753bcc5a1970'
  AND correct_answer = 0;

-- ----------------------------------------------------------------------------
-- 2) 1e8646d1-2c68-404c-b7ae-04daf388ea19
--     Q: "How many minarets does Masjid al-Haram have?"
-- BEFORE:   correct_answer = 1 ("9").
-- PROPOSED: question reworded with "currently" (BN: "বর্তমানে");
--           correct_answer = 3 ("13"); explanation cites the official sources
--           and explains why 9 is outdated. Old counts kept as distractors.
-- EVIDENCE: 13 VERIFIED by >=2 independent official sources:
--   - Saudi Press Agency dispatch, 24 Mar 2025 (quoting the General Presidency
--     for the Affairs of the Grand Mosque and the Prophet's Mosque):
--     "the Grand Mosque has 13 minarets".
--   - Saudipedia (official Saudi encyclopedia): "There are thirteen minarets."
--   Historical note (IIUM Journal of Architecture, Planning & Construction
--   Management): 9 was the genuine count after King Fahd's second Saudi
--   expansion (1409 AH / 1988 CE); it later rose to 11 (King Abdullah
--   expansion) and then 13 — so "9" is outdated as a current answer but was a
--   real past phase, which is exactly why the question needs "currently".
-- ----------------------------------------------------------------------------
UPDATE quiz_questions
SET question_en = 'How many minarets does Masjid al-Haram currently have?',
    question_bn = 'REVIEW-TRANSLATION: মসজিদুল হারামে বর্তমানে কতটি মিনারেট আছে?',
    correct_answer = 3,
    explanation_en = $$According to the General Presidency for the Affairs of the Grand Mosque and the Prophet's Mosque, the Grand Mosque has 13 minarets (Saudi Press Agency, 24 Mar 2025); Saudipedia likewise states: 'There are thirteen minarets.' Nine was the count after King Fahd's second Saudi expansion (1988) and is now outdated - hence 'currently'.$$,
    explanation_bn = $$REVIEW-TRANSLATION: গ্র্যান্ড মসজিদ ও মসজিদে নববীর বিষয়ক সাধারণ কর্তৃপক্ষ (General Presidency) জানিয়েছে, মসজিদুল হারামে ১৩টি মিনারেট রয়েছে (সৌদি প্রেস এজেন্সি, ২৪ মার্চ ২০২৫); সৌদিপিডিয়াও বলেছে 'তেরোটি মিনারেট আছে'। বাদশাহ ফাহাদের দ্বিতীয় সৌদি সম্প্রসারণের (১৯৮৮) পর মিনারেটের সংখ্যা ছিল ৯টি — যা এখন পুরনো তথ্য, তাই 'বর্তমানে' শব্দটি যুক্ত করা হয়েছে।$$
WHERE id = '1e8646d1-2c68-404c-b7ae-04daf388ea19'
  AND correct_answer = 1;

-- ----------------------------------------------------------------------------
-- 3) cc209308-1002-49ce-b511-d4eda894b240
--     Q: "What is the greatest Jihad?"  (key: "Jihad against the self")
-- BEFORE:   question asserts an unverified superlative; the famous "greater
--           jihad" report is weak/fabricated.
-- PROPOSED: full rewrite — drops the ranking claim and tests only what the
--           hadith actually says; options, key, and explanations replaced.
-- EVIDENCE: VERIFIED by >=2 independent reputable sources:
--   - Jami' at-Tirmidhi 1621 (sunnah.com): "The Mujahid is one who strives
--     against his own soul." — graded Hasan Sahih by Imam at-Tirmidhi;
--     also authenticated by al-Hakim and al-Albani (as-Sahihah 549);
--     Ibn Taymiyyah called its isnad jayyid (islamqa.info #202449).
--   - The "greater jihad" report is NOT authentic: al-Bayhaqi graded its chain
--     weak; Ibn Hajar traced the wording to the Tabi'i Ibrahim ibn Abi
--     'Ablah, not the Prophet (islamqa.org fatwa, Mufti Ebrahim Desai).
-- ----------------------------------------------------------------------------
UPDATE quiz_questions
SET question_en = $$According to Jami' at-Tirmidhi 1621, the mujahid is the one who strives against ___?$$,
    question_bn = 'REVIEW-TRANSLATION: জামি'' আত-তিরমিযীর ১৬২১ নম্বর হাদিস অনুযায়ী, মুজাহিদ হলো সেই ব্যক্তি যে কিসের বিরুদ্ধে জিহাদ করে?',
    options_en = ARRAY['His enemy', 'His own soul (nafs)', 'Poverty', 'His fear'],
    options_bn = ARRAY['REVIEW-TRANSLATION: শত্রুর বিরুদ্ধে', 'REVIEW-TRANSLATION: নিজের নফসের বিরুদ্ধে', 'REVIEW-TRANSLATION: দারিদ্র্যের বিরুদ্ধে', 'REVIEW-TRANSLATION: ভয়ের বিরুদ্ধে'],
    correct_answer = 1,
    explanation_en = $$The Prophet (peace be upon him) said: 'The Mujahid is one who strives against his own soul.' (Jami' at-Tirmidhi 1621 - graded Hasan Sahih by Imam at-Tirmidhi). Note: the popular 'greater jihad' report ('We have returned from the lesser jihad to the greater jihad') is not an authentic hadith - al-Bayhaqi graded its chain weak, and Ibn Hajar traced the wording to the Tabi'i Ibrahim ibn Abi 'Ablah, not the Prophet.$$,
    explanation_bn = $$REVIEW-TRANSLATION: রাসূলুল্লাহ (সা.) বলেছেন: 'মুজাহিদ হলো সেই ব্যক্তি যে নিজের নফসের বিরুদ্ধে জিহাদ করে।' (জামি' আত-তিরমিযী ১৬২১ — ইমাম তিরমিযী এটিকে হাসান-সহীহ বলেছেন)।$$
WHERE id = 'cc209308-1002-49ce-b511-d4eda894b240'
  AND correct_answer = 1;

-- ----------------------------------------------------------------------------
-- 4) 942d1620-dd6e-453f-9c3e-a927ddc7a3e5
--     Q: "Which Surah mentions 99 names of Allah?"  (key: Al-Hashr)
-- BEFORE:   premise is FALSE — no surah lists all 99 names.
-- PROPOSED: rewrite discards the false premise; asks a verifiable question
--           about the closing verses of Al-Hashr; options unchanged; key
--           stays 0; explanation explicitly corrects the false premise.
-- EVIDENCE: VERIFIED from primary text:
--   - Quran.com API (Quran Foundation), 59:22-24: the closing verses contain a
--     limited cluster of names (Al-Malik, Al-Quddus in 59:23, etc.), not 99.
--   - Surah Al-Hashr has 24 verses, so 59:22-24 are its closing verses.
--   - Sahih al-Bukhari 2736 (sunnah.com): "Allah has ninety-nine names..."
--     states the number but lists NONE of them; no surah is given as the
--     source of a 99-name list.
-- ----------------------------------------------------------------------------
UPDATE quiz_questions
SET question_en = $$The closing verses of which surah mention several of Allah's names, such as Al-Malik and Al-Quddus?$$,
    question_bn = $$REVIEW-TRANSLATION: কোন সূরার সমাপনী আয়াতগুলোতে আল্লাহর বেশ কয়েকটি নাম উল্লেখ আছে, যেমন আল-মালিক ও আল-কুদ্দুস?$$,
    correct_answer = 0,
    explanation_en = $$Surah Al-Hashr's closing verses (59:22-24) contain a cluster of Allah's names, including Al-Malik (the Sovereign) and Al-Quddus (the Pure). Note: no surah lists all 99 names - the hadith in Sahih al-Bukhari 2736 says Allah has ninety-nine names but does not list them.$$,
    explanation_bn = $$REVIEW-TRANSLATION: সূরা আল-হাশরের সমাপনী আয়াতগুলোতে (৫৯:২২–২৪) আল্লাহর বেশ কিছু নাম রয়েছে, যার মধ্যে আল-মালিক ও আল-কুদ্দুস অন্তর্ভুক্ত। মনে রাখুন: কোনো সূরাতেই ৯৯টি নাম একসাথে উল্লেখ নেই — সহীহ বুখারী ২৭৩৬ নম্বর হাদীসে ৯৯টি নামের কথা বলা হলেও নামগুলোর তালিকা দেওয়া হয়নি।$$
WHERE id = '942d1620-dd6e-453f-9c3e-a927ddc7a3e5'
  AND correct_answer = 0;

-- ============================================================================
-- Deliberately NOT in this file (need human/editorial/scholar decisions):
--   RETIRE (4): fa6b14bc, 47cebbaf (Miraj month — no authentic dating),
--               21268d41 (Nuh flood duration — Quran states none),
--               09d8d668 (40 neighbors — al-Albani: da'eef; authentic wording
--               belongs to al-Hasan al-Basri, Adab al-Mufrad 109).
--               Retirement changes visibility; confirm with an editor first.
--   REWRITE, no automatic fix (2): f4f1cb3c, bf41f99d (sajdah count is
--               madhhab-dependent: Hanafi 14 vs Shafi'i/Ahmad 15, differentiator
--               Hajj 22:77 — VERIFIED; the app must choose the school for the
--               question stem).
--   NEEDS_MORE_EVIDENCE (6): 2d8b8a13, 878f699d (Allah 2,699 per corpus; no
--               option is correct — needs a rewrite with a stated convention);
--               22581591, 30fecbf8, 30d473e5 (Israfil/Mikail duties only
--               PARTIALLY_VERIFIED via IslamQA #9477 doctrinal statement —
--               needs a graded hadith or scholar sign-off); acc3a306 (ruku 540
--               is the traditional design goal, but actual marker counts are
--               disputed 540 vs 558 — CONFLICTING).
--   KEEP (1): 7ff963fe (Musa most mentioned — VERIFIED, key already correct).
-- ============================================================================
