# NoorApp Audio URL Deployment Guide

এই গাইডে NoorApp-এর গল্পের অডিও কীভাবে external hosting থেকে public direct URL হিসেবে ব্যবহার করতে হবে তা বর্ণনা করা হয়েছে। Repository বা Supabase-এ MP3 ফাইল রাখা হবে না।

## সম্পন্ন পরিবর্তন

1. **Admin Panel:** Story editor-এ SoundCloud embed/iframe-এর পরিবর্তে `Story Audio URL (direct MP3)` field যোগ করা হয়েছে।
2. **Public Story Page:** SoundCloud Widget API সরিয়ে native HTML audio playback যুক্ত করা হয়েছে। Play/pause, seek, rewind, forward, duration এবং playback error handling এখন browser-এর audio element দিয়ে পরিচালিত হয়।
3. **Import/Export:** Story JSON import/export-এ `audio_url` এবং `audio_trailer_url` সংরক্ষিত থাকে।
4. **Database:** Existing `admin_content.audio_url` column গল্পের direct audio URL-এর জন্য ব্যবহৃত হচ্ছে; নতুন SoundCloud-specific column বা migration প্রয়োজন নেই। পুরোনো `audio_embed_code` column থাকলে সেটি আর runtime-এ ব্যবহার করা হয় না।

## Audio hosting requirements

প্রতিটি গল্পের full MP3 একটি public URL-এ রাখতে হবে, যেমন:

```text
https://cdn.example.com/noorapp/audio/story-01.mp3
```

Hosting থেকে URL দেওয়ার আগে নিশ্চিত করুন যে ফাইলটি login ছাড়া খোলা যায়, server `audio/mpeg` content type পাঠায়, HTTP range requests সমর্থন করে এবং NoorApp-এর জন্য CORS অনুমোদিত থাকে। Cloudflare R2 ব্যবহার করলে bucket বা custom domain public read-এর জন্য configure করতে হবে।

## Admin Panel-এ URL যোগ করার নিয়ম

1. NoorApp-এর Admin Panel-এ প্রবেশ করুন এবং **Stories** section খুলুন।
2. একটি story নির্বাচন করে edit করুন।
3. **Story Audio URL (direct MP3)** field-এ hosting provider-এর full MP3 URL paste করুন।
4. URL-টি `https://` বা `http://` দিয়ে শুরু হচ্ছে কি না যাচাই করুন।
5. **Save** করুন। Save হওয়ার পর public story page-এ native audio player URLটি ব্যবহার করবে।

**SoundCloud iframe বা embed code এখানে paste করবেন না।** Audio URL এবং social sharing-এর জন্য ব্যবহৃত 30-second trailer URL আলাদা field-এ রাখা হয়েছে।

## JSON import format

Story import করলে direct audio URL এই property-তে দিতে হবে:

```json
{
  "slug": "example-story",
  "title_bn": "উদাহরণ গল্প",
  "audio_url": "https://cdn.example.com/noorapp/audio/example-story.mp3",
  "audio_trailer_url": "https://cdn.example.com/noorapp/audio/example-story-trailer.mp3"
}
```

## Public page verification

Story save করার পর public story page refresh করে নিচের বিষয়গুলো যাচাই করুন:

1. Story image-এর ওপর audio indicator এবং নিচে player দেখা যাচ্ছে কি না।
2. Play/pause, 10-second rewind এবং 10-second forward কাজ করছে কি না।
3. Progress bar ও duration সঠিকভাবে load হচ্ছে কি না।
4. Audio চালু হলে browser network panel-এ MP3 URL থেকে `200` বা valid range response আসছে কি না।
5. Audio না চললে player-এর error message দেখুন এবং URL, public access, `Content-Type: audio/mpeg`, range support ও CORS settings যাচাই করুন।

## Social sharing trailer

`audio_trailer_url` শুধু 30-second social-sharing trailer-এর জন্য। Full story player-এর জন্য সবসময় `audio_url` ব্যবহার করুন। Trailer URL-ও public direct MP3 URL হওয়া উচিত।

## Repository পরিবর্তন

```text
src/components/admin/story/StoryAudioUrlInput.tsx
src/components/admin/story/StoryAudioEmbedInput.tsx       (removed)
src/components/admin/story/StoryImportPanel.tsx
src/integrations/supabase/types.ts
src/lib/stories.ts
src/pages/admin/AdminContent.tsx
src/pages/StoryDetailPage.tsx
```

## Validation status

| Check | Status |
|---|---|
| SoundCloud runtime/API dependency removed | ✅ |
| Admin direct URL field | ✅ |
| Public native audio player | ✅ |
| Story import/export URL support | ✅ |
| Production Vite build | ✅ |
| Full repository TypeScript check | ⚠️ Existing unrelated errors remain in other modules |
| Full repository lint | ⚠️ Existing unrelated lint errors remain in other modules |

## Deployment sequence

1. Hosting provider-এ audio files upload করুন।
2. প্রতিটি full MP3-এর public direct URL সংগ্রহ করুন।
3. NoorApp Admin Panel-এ story অনুযায়ী URL save করুন অথবা JSON import করুন।
4. Code push করে Vercel/আপনার deployment platform-এ deploy করুন।
5. কয়েকটি story mobile এবং desktop browser-এ পরীক্ষা করুন।

**গুরুত্বপূর্ণ:** MP3 files repository, Supabase database বা website bundle-এর ভিতরে যোগ করবেন না; database-এ শুধু URL রাখবেন।
