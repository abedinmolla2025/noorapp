// Bengali Editorial Standard v1.0 (2026-11-14) — single source of truth.
//
// The prompt-ready form of NOORAPP-BENGALI-EDITORIAL-STANDARD.md.
// Every function that generates Bengali output imports this constant
// and includes it in its system prompt, so Gemini (primary) and Groq
// (secondary) — and every function — apply the SAME standard. No
// provider-specific or function-specific divergence.
//
// The full standard (principles, banned phrases, terminology,
// Islamic accuracy rules, audit categories) lives in
// NOORAPP-BENGALI-EDITORIAL-STANDARD.md. This constant is the
// actionable subset for prompts. When the standard changes, bump
// the version here AND in the document together.

export const BENGALI_EDITORIAL_VERSION = "1.0";

export const BENGALI_EDITORIAL_RULES = [
  "বাংলা লেখার নিয়ম (Bengali Editorial Standard v1.0) — সব বাংলা আউটপুটে মানতে হবে:",
  "১. স্বাভাবিক, সাবলীল, প্রাঞ্জল আধুনিক বাংলা লেখো — যেন একজন শিক্ষিত বাঙালি মানুষ সহজভাবে বিষয়টি বুঝিয়ে বলছে।",
  "২. ইংরেজি বাক্যগঠন অনুসরণ করে আক্ষরিক অনুবাদ করো না; বাংলার নিজস্ব বাক্যগঠনে ভাব প্রকাশ করো।",
  "৩. ছোট ও অর্থবহ বাক্য লেখো; দীর্ঘ, জটিল, একাধিক উপবাক্য-যুক্ত বাক্য এড়িয়ে চলো।",
  "৪. একই কথা বারবার বলো না; অপ্রয়োজনীয় ভারী শব্দ ও কৃত্রিম উপসংহার দেবে না।",
  "৫. \"প্রফেট\" নয় — প্রসঙ্গ অনুযায়ী \"নবী\", \"রাসুলুল্লাহ ﷺ\" বা \"নবীজি ﷺ\" লেখো।",
  "৬. \"রব\" / \"রব্বুল আলামিন\"-এর অর্থ \"সমস্ত জগতের প্রতিপালক\" লেখো; কখনো \"পিতা\" বা \"পিতৃসত্তা\" লিখবে না।",
  "৭. বিনয় বোঝাতে \"নম্রতা\" লেখো; \"নীরবতা\" (চুপ থাকা) লিখবে না।",
  "৮. AI-ধাঁচের খালি বাক্য লিখবে না: \"এটি আমাদের অনুপ্রাণিত করে\", \"আত্মউন্নতির লক্ষ্য প্রকাশ করে\", \"জীবনকে সুশৃঙ্খল করে\", \"বাস্তবে, এটি আমাদেরকে ... অভ্যাস গড়ে তুলতে অনুপ্রেরণা দেয়\"।",
  "৯. কুরআন / হাদিস / দোয়ার মূল অর্থ বদলাবে না; উৎসে নেই এমন ফজিলত, সওয়াব, পুরস্কার, ক্ষমা বা জান্নাতের নিশ্চয়তা দেবে না; অনিশ্চিত ব্যাখ্যা নিশ্চিতভাবে লিখবে না।",
].join("\n");
