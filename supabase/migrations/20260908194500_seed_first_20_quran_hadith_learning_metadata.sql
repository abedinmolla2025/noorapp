-- Verified learning metadata for the first 20 active Quran/Hadith quiz records
-- identified from the production quiz_questions order on 2026-09-08.
-- References deliberately state uncertainty where the quiz claim is disputed.

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS explanation_bn TEXT,
  ADD COLUMN IF NOT EXISTS explanation_en TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS related_url TEXT;

UPDATE public.quiz_questions SET
  explanation_bn = 'সূরা আল-ফাতিহাকে উম্মুল কুরআন (কুরআনের মাতা) বলা হয়েছে। সহিহ বুখারী ৪৪৭৪-এ নবী ﷺ আল-ফাতিহাকে “সাতটি পুনরাবৃত্ত আয়াত” ও মহান কুরআন বলেছেন।',
  explanation_en = 'Surah al-Fatihah is known as Umm al-Quran. In Sahih al-Bukhari 4474, the Prophet ﷺ described it as the seven oft-repeated verses and the Great Quran.',
  source_reference = 'Sahih al-Bukhari 4474 — https://sunnah.com/bukhari:4474; Quran 1:1–7',
  related_url = '/quran/1'
WHERE id = '3c4ae60a-24a1-4874-aa65-c9fd209deb8a';

UPDATE public.quiz_questions SET
  explanation_bn = 'সূরা আন-নামল ২৭:৩০-এ সুলাইমান (আ.)-এর চিঠিতে “বিসমিল্লাহির রাহমানির রাহিম” এসেছে। সূরার শুরুতেও বিসমিল্লাহ থাকায় এই সূরায় তা দুইবার দেখা যায়।',
  explanation_en = 'Surah An-Naml contains the opening basmalah and another basmalah in verse 27:30, in Sulayman’s letter to the Queen of Sheba.',
  source_reference = 'Quran 27:30 — https://quran.com/an-naml/30',
  related_url = '/quran/27'
WHERE id = '57249de2-c7e6-4ed5-aef7-066dfbf63acf';

UPDATE public.quiz_questions SET
  explanation_bn = 'ইয়াসীনকে “কুরআনের হৃদয়” বলা একটি প্রচলিত উপাধি; তবে এ বিষয়ে প্রচলিত মারফূ বর্ণনাগুলো সহিহ হিসেবে নির্ভরযোগ্য নয়। তাই এটি কুরআনের সরাসরি উপাধি হিসেবে নয়, প্রচলিত অভিব্যক্তি হিসেবে বোঝা উচিত।',
  explanation_en = '“Heart of the Quran” is a popular epithet for Surah Yasin, but the commonly cited marfu reports for this wording are not reliably authentic. It should therefore be presented as a popular expression, not an established Quranic title.',
  source_reference = 'Sunan Ibn Majah 1385 — https://sunnah.com/ibnmajah:1385; authenticity caveat required',
  related_url = '/quran/36'
WHERE id = 'c9b2b485-752a-4251-a996-256114315cd6';

UPDATE public.quiz_questions SET
  explanation_bn = 'কুরআনে “আল্লাহ” শব্দের গণনা আরবি বানান, সংযুক্ত রূপ ও tokenization-এর নিয়ম অনুযায়ী সামান্য ভিন্ন হতে পারে। এই quiz-এর ২,৬৯৮ উত্তরটি প্রচলিত গণনা; এটিকে সর্বজনীনভাবে একমাত্র সংখ্যা হিসেবে না দেখানো উচিত।',
  explanation_en = 'Counts of the word Allah can vary with Arabic orthography, attached forms, and tokenization rules. This quiz uses the commonly cited count 2,698; it should not be presented as the only possible count without stating the counting method.',
  source_reference = 'Quranic Arabic Corpus search and counting methodology — https://corpus.quran.com/search.jsp?q=allah',
  related_url = '/quran'
WHERE id = '878f699d-0124-43cd-9bbf-a6917183b59d';

UPDATE public.quiz_questions SET
  explanation_bn = 'প্রচলিত কুফি আয়াত-গণনা অনুযায়ী কুরআনে ৬,২৩৬ আয়াত ধরা হয়। আয়াত বিভাজনের ঐতিহ্যভেদে গণনায় পার্থক্য হতে পারে; ৬,৬৬৬ সংখ্যা জনপ্রিয় হলেও standard verse count নয়।',
  explanation_en = 'The commonly used Kufan verse numbering counts 6,236 verses. Counts can differ by verse-numbering tradition; 6,666 is a popular figure but is not the standard count used by most modern Quran editions.',
  source_reference = 'Quran.com Quran text and standard verse numbering — https://quran.com; numbering traditions should be stated',
  related_url = '/quran'
WHERE id = '1fb71d14-dc23-4e3e-a1f3-0d65b0a7353b';

UPDATE public.quiz_questions SET
  explanation_bn = 'ইয়াসীনকে প্রচলিতভাবে “কুরআনের হৃদয়” বলা হয়। তবে এই উপাধির পক্ষে উদ্ধৃত হাদিসের গ্রহণযোগ্যতা নিয়ে মুহাদ্দিসদের আলোচনা আছে; তাই quiz explanation-এ এই caveat রাখা হয়েছে।',
  explanation_en = 'Surah Yasin is popularly called the “Heart of the Quran,” but the hadith commonly cited for this title has a disputed authenticity assessment. The caveat is part of the answer.',
  source_reference = 'Sunan Ibn Majah 1385 — https://sunnah.com/ibnmajah:1385; authenticity caveat required',
  related_url = '/quran/36'
WHERE id = '09efa818-ed4d-4e91-a977-60005fb6850a';

UPDATE public.quiz_questions SET
  explanation_bn = 'আন-নাসরকে শেষ পূর্ণ সূরা হিসেবে উল্লেখ করে ইবন আব্বাস (রা.)-এর বর্ণনা সহিহ বুখারীতে এসেছে। তবে “শেষ নাযিল হওয়া সূরা” এবং “শেষ নাযিল হওয়া আয়াত”—এই দুই প্রশ্ন আলাদা, এবং বর্ণনাগুলোর মধ্যে মতভেদ আছে।',
  explanation_en = 'A report from Ibn Abbas identifies An-Nasr as the last complete surah revealed. The last complete surah and the last individual verse are different questions, and reports on the final revelation have scholarly disagreement.',
  source_reference = 'Sahih al-Bukhari 4970 — https://sunnah.com/bukhari:4970',
  related_url = '/quran/110'
WHERE id = '846eb438-97c9-435c-90c2-753c50f9a5d2';

UPDATE public.quiz_questions SET
  explanation_bn = 'আয়াতুল কুরসি সূরা আল-বাকারাহ ২:২৫৫-এর অংশ। এখানে আল্লাহর জীবন, জ্ঞান, কর্তৃত্ব ও কিয়াম-এর মহিমা বর্ণিত হয়েছে।',
  explanation_en = 'Ayat al-Kursi is Quran 2:255 in Surah al-Baqarah. The verse describes Allah’s living, knowledge, authority, and supreme sovereignty.',
  source_reference = 'Quran 2:255 — https://quran.com/al-baqarah/255',
  related_url = '/quran/2'
WHERE id = 'f3b63b75-8d4f-43cc-af5f-2d415b0f8b3d';

UPDATE public.quiz_questions SET
  explanation_bn = 'সূরা আর-রহমানে “ফাবিআইয়্যি আলা-ই রাব্বিকুমা তুকাযযিবান” আয়াতটি বারবার এসেছে। এটি আল্লাহর নেয়ামত অস্বীকার না করার জন্য জিন ও মানুষকে স্মরণ করিয়ে দেয়।',
  explanation_en = 'The verse “So which of your Lord’s favors will you both deny?” is repeated throughout Surah ar-Rahman, addressing both humans and jinn and directing attention to Allah’s favors.',
  source_reference = 'Quran 55:13 and repeated occurrences in Surah ar-Rahman — https://quran.com/ar-rahman/13',
  related_url = '/quran/55'
WHERE id = 'f20bd047-f8a3-44d8-b23c-ade91375ec23';

UPDATE public.quiz_questions SET
  explanation_bn = 'কুরআনে ২৫ জন নবীর নাম সরাসরি উল্লেখ আছে—এটি কুরআনের বিভিন্ন আয়াতের নাম-উল্লেখের ভিত্তিতে প্রচলিত গণনা। কুরআন সব নবীর নাম উল্লেখ করেনি।',
  explanation_en = 'Twenty-five prophets are commonly counted as being named explicitly in the Quran. The Quran also makes clear that not every prophet was named in the revelation.',
  source_reference = 'Quran 6:83–86, 21:85–86, 19:41–57 and related passages — https://quran.com/6/83-86',
  related_url = '/quran'
WHERE id = '9322e182-0aaa-4fee-8907-753bcc5a1970';

UPDATE public.quiz_questions SET
  explanation_bn = 'সূরা আল-কাহফের প্রথম দশ আয়াত মুখস্থ/পাঠ করার মাধ্যমে দাজ্জালের ফিতনা থেকে সুরক্ষার কথা সহিহ মুসলিমের বর্ণনায় এসেছে। এটি ধনসম্পদ বা পার্থিব সুবিধার প্রতিশ্রুতি নয়।',
  explanation_en = 'Sahih Muslim reports protection from the trial of the Dajjal for one who memorizes the first ten verses of Surah al-Kahf. The hadith does not promise wealth or other worldly benefits.',
  source_reference = 'Sahih Muslim 809a — https://sunnah.com/muslim:809a',
  related_url = '/quran/18'
WHERE id = '6a8e8eed-7f41-428f-b709-ec79eea9fb9e';

UPDATE public.quiz_questions SET
  explanation_bn = 'কুরআনে সবচেয়ে বেশি নাম উল্লেখিত নবী মূসা (আ.)। বিভিন্ন গণনা-পদ্ধতিতে সংখ্যা কিছুটা ভিন্নভাবে উপস্থাপিত হতে পারে, তবে নাম-উল্লেখের দিক থেকে মূসা (আ.)-ই সর্বাধিক।',
  explanation_en = 'Musa (Moses), peace be upon him, is the prophet named most frequently in the Quran. Exact counts can vary by counting method, but Musa is consistently identified as the most frequently named prophet.',
  source_reference = 'Quranic Arabic Corpus search for Musa — https://corpus.quran.com/search.jsp?q=musa',
  related_url = '/quran'
WHERE id = '7ff963fe-1dd0-4b89-b1e7-aae7167b696b';

UPDATE public.quiz_questions SET
  explanation_bn = 'সূরা আল-মুলক সম্পর্কে বর্ণিত হাদিসে ত্রিশ আয়াতের এই সূরার সুপারিশের কথা এসেছে। “কবরের আজাব থেকে রক্ষা” হিসেবে প্রচলিত বক্তব্যের sanad ও grading নিয়ে আলেমদের আলোচনা আছে; তাই এটিকে নিশ্চিত গ্যারান্টি হিসেবে লেখা যাবে না।',
  explanation_en = 'A hadith describes a thirty-verse surah, Surah al-Mulk, interceding for its companion. The popular wording “protection from grave punishment” has discussions regarding chains and grading, so it should not be presented as an unconditional guarantee.',
  source_reference = 'Jami at-Tirmidhi 2891 — https://sunnah.com/tirmidhi:2891; grading caveat required',
  related_url = '/quran/67'
WHERE id = '62df78df-bb0a-4dd9-82f8-3826a0958cd0';

UPDATE public.quiz_questions SET
  explanation_bn = 'সূরা আত-তাওবার শুরুতে বিসমিল্লাহ লেখা হয়নি। সূরার প্রথম আয়াতেই মুশরিকদের সঙ্গে চুক্তি-সংক্রান্ত ঘোষণা শুরু হয়েছে; এই quiz কেবল সূরার লিখিত opening সম্পর্কে।',
  explanation_en = 'Surah At-Tawbah is the only surah in the standard Quran text that begins without the basmalah. Its opening starts with a declaration concerning treaties with the polytheists.',
  source_reference = 'Quran 9:1 — https://quran.com/at-tawbah/1',
  related_url = '/quran/9'
WHERE id = '8b2920fd-1348-482c-9d0f-7ec8a4d68175';

UPDATE public.quiz_questions SET
  explanation_bn = 'সহিহ আল-বুখারী সংকলন করেছেন ইমাম মুহাম্মদ ইবন ইসমাঈল আল-বুখারী (রহ.)। “সংকলনকারী” বলা হয়েছে; তিনি হাদিসের বর্ণনাকারী সাহাবি নন।',
  explanation_en = 'Sahih al-Bukhari was compiled by Imam Muhammad ibn Ismail al-Bukhari. The question asks for the compiler, not the Companion who narrated any individual hadith.',
  source_reference = 'Sahih al-Bukhari collection — https://sunnah.com/bukhari',
  related_url = '/hadith/sahih-bukhari'
WHERE id = '5d092bf2-baac-4339-9af1-37121d93c862';

UPDATE public.quiz_questions SET
  explanation_bn = 'সিহাহ সিত্তাহ বলতে সুন্নি ইসলামের ছয়টি প্রসিদ্ধ হাদিসগ্রন্থকে বোঝানো হয়। ছয়টি গ্রন্থের তালিকায় আলেমদের মধ্যে কিছু পার্থক্য থাকতে পারে; তাই “ছয়টি প্রধান গ্রন্থ” একটি প্রচলিত সংজ্ঞা।',
  explanation_en = 'Sihah Sitta is a common term for six major Sunni hadith collections. The exact list can vary among scholars, so “six major hadith books” is a conventional definition rather than a single universally fixed canon.',
  source_reference = 'Sunnah.com collections index — https://sunnah.com/collections; list varies by scholarly convention',
  related_url = '/hadith'
WHERE id = '61f6749b-22fd-4fa5-bae8-4883e34eab03';

UPDATE public.quiz_questions SET
  explanation_bn = 'হাদীসে কুদসিতে অর্থ আল্লাহর পক্ষ থেকে এবং তা নবী ﷺ তাঁর নিজের ভাষায় বর্ণনা করেন—প্রচলিত সংজ্ঞা অনুযায়ী। এটি কুরআনের আয়াত নয়; কুরআন ও হাদীসে কুদসির সংজ্ঞা ও মর্যাদা এক নয়।',
  explanation_en = 'In the conventional definition, a hadith qudsi conveys meaning attributed to Allah while the Prophet ﷺ expresses it in his own wording. It is not a Quranic verse, and its status is distinct from the Quran.',
  source_reference = 'Sunnah.com Hadith Qudsi collection — https://sunnah.com/qudsi; terminology is defined in hadith scholarship',
  related_url = '/hadith'
WHERE id = 'eaa41b72-26a9-4911-82fc-b8e00d9be564';

UPDATE public.quiz_questions SET
  explanation_bn = 'সূরা আল-ফাতিহায় সাতটি আয়াত আছে। সহিহ বুখারী ৪৪৭৪-এ নবী ﷺ এটিকে “সাতটি পুনরাবৃত্ত আয়াত” বলেছেন।',
  explanation_en = 'Surah al-Fatihah has seven verses. Sahih al-Bukhari 4474 calls it the seven oft-repeated verses.',
  source_reference = 'Sahih al-Bukhari 4474 — https://sunnah.com/bukhari:4474; Quran 1:1–7',
  related_url = '/quran/1'
WHERE id = '713c1853-27b9-49a5-8b2b-0e28b4a7f84c';

UPDATE public.quiz_questions SET
  explanation_bn = 'সহিহ বুখারী ৫০১৩-সহ একাধিক সহিহ বর্ণনায় সূরা ইখলাসকে কুরআনের এক-তৃতীয়াংশের সমতুল্য বলা হয়েছে। এর অর্থ সওয়াব/মর্যাদার দিকের তুলনা; এটি কুরআনের এক-তৃতীয়াংশ পাঠের বিকল্প নয়।',
  explanation_en = 'Authentic narrations, including Sahih al-Bukhari 5013, describe Surah al-Ikhlas as equivalent to one-third of the Quran. This refers to virtue and meaning, not a replacement for reciting one-third of the Quran.',
  source_reference = 'Sahih al-Bukhari 5013 — https://sunnah.com/bukhari:5013; Quran 112:1–4',
  related_url = '/quran/112'
WHERE id = 'b777dff5-e1a1-420c-a60e-39e6e94c3cfa';

UPDATE public.quiz_questions SET
  explanation_bn = 'কুরআনে প্রচলিত গণনায় ১৫টি তিলাওয়াতের সিজদার স্থান ধরা হয়। ফিকহি গণনা-পদ্ধতিতে ১৪ বা ১৫ বলা হতে পারে; তাই quiz-এ প্রচলিত ১৫ উত্তর হলেও মতভেদের নোট থাকা উচিত।',
  explanation_en = 'The commonly used count is fifteen prostration places in the Quran. Some fiqh counting traditions count fourteen, so the quiz should identify the convention rather than present the number as uncontested.',
  source_reference = 'Quranic sajdah markers; examples include Quran 22:18, 19:58, 32:15 and 96:19 — https://quran.com',
  related_url = '/quran'
WHERE id = 'f4f1cb3c-cb26-4760-9d96-534884bec559';
