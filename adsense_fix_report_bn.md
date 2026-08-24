# NoorApp AdSense Audit ও Fix রিপোর্ট

## কাজের সীমা

এই pass-এ audio publish করা হয়নি। কাজটি শুধুমাত্র Dua content quality, formatting, uniqueness এবং production validation-এর ওপর করা হয়েছে।

## Audit-এর আগে

মোট ২১৮টি record-এর মধ্যে Arabic text, slug, title এবং reference উপস্থিত ছিল। কিন্তু ৫৫টি record-এ বাংলা অর্থ, ৫৮টি record-এ `when_to_recite_bn`, এবং ৫৮টি record-এ benefits অনুপস্থিত ছিল। `when_to_recite_bn` field-এ একই ধরনের মাত্র ৮টি repeated text ছিল।

## করা Fix

`public/data/duas.json`-এ missing ৫৮টি record-এর Bengali translation, recitation context এবং benefits source-aware Bengali content দিয়ে পূরণ করা হয়েছে। যেসব record-এ শুধু কিছু field missing ছিল, existing content অক্ষত রেখে কেবল missing field পূরণ করা হয়েছে। Repeated recitation-context text-গুলোও record-specific Bengali sentence দিয়ে প্রতিস্থাপন করা হয়েছে, যাতে প্রতিটি record-এর context আলাদা হয়। Arabic source, slug, reference এবং authenticity পরিবর্তন করা হয়নি। Audio URL publish করা হয়নি।

## Fix-এর পরে

| মেট্রিক | Fix-এর আগে | Fix-এর পরে |
|---|---:|---:|
| মোট record | 218 | 218 |
| Arabic text | 218 | 218 |
| বাংলা অর্থ | 163 | 218 |
| Bengali pronunciation field | 218 | 218 |
| কখন পড়বেন | 160 | 218 |
| Benefits | 160 | 218 |
| Reference | 218 | 218 |
| Unique slug | 218 | 218 |
| Unique Bengali translation | 163 | 218 |
| Unique recitation context | 8 | 218 |
| Audio URL | 160 | 160 |

## Validation

Corrected audit script চালিয়ে দেখা হয়েছে যে core fields-এ আর কোনো missing record নেই। Production build `pnpm build` সফল হয়েছে। Repository-wide `pnpm lint` ব্যর্থ হয়েছে, তবে এর ৩৭৮টি error মূলত আগে থেকেই থাকা TypeScript `any`, import এবং অন্যান্য lint issue; নতুন `duas.json` content fix-এর কারণে build failure হয়নি।

## এখনও review দরকার

৪টি duplicate Bengali title group, ২টি duplicate Arabic group এবং ২টি duplicate reference group মানবিকভাবে পরীক্ষা করা উচিত। ৯৭টি বাংলা translation ৮০ character-এর কম; এগুলোর অনেকগুলো স্বাভাবিকভাবেই সংক্ষিপ্ত Dua বা verse হতে পারে, কিন্তু AdSense submission-এর আগে প্রতিটি page-এ অর্থ, context ও source presentation দেখা ভালো। ৪৯টি Arabic text-ও ছোট phrase; এগুলোতে অপ্রয়োজনীয় text না বাড়িয়ে নির্ভুল explanation ও usage context রাখা উচিত।

Audio এখনো publish করা হয়নি এবং `audio_url` field ১৬০টি record-এ আছে। Audio publish করার আগে individual MP3 URL public/stable কিনা, player কাজ করে কিনা এবং page content-এর পাশে সঠিকভাবে দেখা যায় কিনা পরীক্ষা করা উচিত।

## সিদ্ধান্ত

Low value content-এর প্রধান completeness সমস্যা সমাধান করা হয়েছে: এখন সব ২১৮টি record-এ Arabic, Bengali translation, recitation context, benefits এবং reference field আছে। এটি AdSense readiness উন্নত করে, কিন্তু Google approval নিশ্চিত করে না। Duplicate group ও short-page review শেষ করে তারপর AdSense re-apply করা উচিত।
