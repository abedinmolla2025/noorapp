import type { IslamicEducationalSectionProps } from "@/components/seo/IslamicEducationalSection";

export const prayerTimesContent: IslamicEducationalSectionProps = {
  title: "About Salah (Prayer) & How Prayer Times Are Calculated",
  intro: [
    "Salah (also written Salat or Namaz) is the second pillar of Islam and the most consistent act of worship a Muslim performs. Every adult Muslim is obliged to pray five times a day at fixed times based on the position of the sun.",
    "Noor calculates your local prayer times from your device location using standard astronomical formulas used by major Islamic authorities worldwide.",
  ],
  sections: [
    {
      heading: "The Importance of Salah in Islam",
      paragraphs: [
        "Allah says in the Qur'an: \"Indeed, prayer has been decreed upon the believers a decree of specified times.\" (Surah An-Nisa 4:103). Salah is described as the first deed a servant will be questioned about on the Day of Judgement.",
        "The Prophet Muhammad ﷺ said: \"The covenant between us and them is prayer; whoever abandons it has disbelieved.\" (Jami' at-Tirmidhi 2621, graded Sahih).",
      ],
    },
    {
      heading: "The Five Daily Prayers",
      paragraphs: [
        "Each of the five obligatory prayers falls in a distinct window of the day, and each has its own recommended sunnah rakʿahs.",
      ],
      list: [
        "Fajr — from true dawn (Subh Sadiq) until sunrise. 2 rakʿah fard.",
        "Dhuhr — starts when the sun passes the meridian, ends at Asr. 4 rakʿah fard.",
        "Asr — starts when an object's shadow equals its own length (Shafi'i) or twice its length (Hanafi), ends at sunset. 4 rakʿah fard.",
        "Maghrib — from just after sunset until the red twilight disappears. 3 rakʿah fard.",
        "Isha — after twilight until true dawn (best performed before midnight). 4 rakʿah fard.",
      ],
    },
    {
      heading: "How Prayer Times Are Calculated",
      paragraphs: [
        "Prayer times are determined by the sun's altitude relative to the horizon at your latitude and longitude on a given date. Fajr begins when the sun is a set angle below the horizon at dawn, and Isha begins when it reaches a similar angle at dusk.",
        "Different Islamic authorities use slightly different angles (called Fajr/Isha angles), producing small variations. Noor's default method is the University of Islamic Sciences, Karachi method (Fajr 18°, Isha 18°); ISNA, Muslim World League, Umm Al-Qura and Egyptian methods can be selected instead in Settings. Times are computed for your coordinates by the Aladhan calculation service.",
        "Dhuhr is derived from solar noon, Asr from a shadow-length factor, and Maghrib from sunset. Times shift by a few minutes each day as the Earth orbits the sun.",
      ],
    },
    {
      heading: "Practical Guidance",
      paragraphs: [
        "Try to pray at the beginning of each prayer window whenever possible — this is more rewarding. Allow ~2-3 minutes of buffer against your printed timetable for safety.",
        "If you miss a prayer, offer it as soon as you remember (qada). Combining or shortening prayers is only permitted while traveling under specific conditions.",
      ],
    },
    {
      heading: "প্রযুক্তিগত ব্যাখ্যা: সময়গুলো ঠিক যেভাবে আসে",
      paragraphs: [
        "এই পেজের সময় Noor App নিজে হিসাব করে না — আপনার অবস্থানের অক্ষাংশ ও দ্রাঘিমাংশ পাঠিয়ে Aladhan (aladhan.com) নামাজ-সময় API থেকে দিনের সময়গুলো আনা হয়। হিসাবের ভিত্তি সূর্যের অবস্থান: ফজর শুরু হয় যখন সূর্য দিগন্তের নিচে একটি নির্দিষ্ট কোণে থাকে, সূর্যোদয় ও মাগরিব হলো সূর্যোদয় ও সূর্যাস্তের মুহূর্ত, যোহর শুরু হয় সূর্য মধ্যগগন অতিক্রম করার পর, আর আসর নির্ধারিত হয় বস্তুর ছায়ার দৈর্ঘ্য দিয়ে। ঠিক কোন কোণ ব্যবহার হবে, তা নির্ভর করে নির্বাচিত হিসাব-পদ্ধতির (calculation method) ওপর।",
        "অবস্থান যেভাবে নির্ধারিত হয়: প্রথমে ব্রাউজারে সংরক্ষিত আগের অবস্থান ব্যবহার হয়; তা না থাকলে IP-ভিত্তিক আনুমানিক অবস্থান (ipapi.co সেবা) নেওয়া হয়। ডিভাইসের GPS অবস্থান দিলে শহরের নাম বের করা হয় OpenStreetMap-এর Nominatim সেবা দিয়ে। GPS অবস্থান যত নির্ভুল, সময় তত নির্ভুল — IP-ভিত্তিক অবস্থান কয়েক কিলোমিটার পর্যন্ত ভুল হতে পারে, তাতে সময়ে কয়েক মিনিটের হেরফের সম্ভব।",
        "আসরের ক্ষেত্রে অ্যাপ API-তে আলাদা কোনো মাযহাব-ভিত্তিক প্যারামিটার পাঠায় না, ফলে সেবাটির default 'Standard' ছায়া-অনুপাত (ছায়া বস্তুর দৈর্ঘ্যের সমান হলে আসর) প্রযোজ্য হয়। হানাফি অনুপাত (ছায়া দ্বিগুণ) ব্যবহার করে এমন স্থানীয় সময়সূচির সঙ্গে আসরের সময়ে পার্থক্য দেখা যেতে পারে — এটি হিসাব-পদ্ধতির পার্থক্য, ত্রুটি নয়।",
        "Settings পেজ থেকে প্রতিটি নামাজের সময়ে নিজে মিনিট যোগ-বিয়োগ (offset) করে স্থানীয় মসজিদের সময়সূচির সঙ্গে মেলানো যায়; এই offset শুধু আপনার ডিভাইসেই সংরক্ষিত থাকে। মনে রাখবেন, এই সময়গুলো হিসাবভিত্তিক — সরকারি বা স্থানীয় মসজিদের ঘোষিত জামাতের সময়ের জন্য তাদের সময়সূচিই চূড়ান্ত।",
      ],
      list: [
        "University of Islamic Sciences, Karachi — ফজর ১৮°, এশা ১৮° (এই অ্যাপের default; Settings থেকে বদলানো যায়)",
        "Islamic Society of North America (ISNA) — ফজর ১৫°, এশা ১৫°",
        "Muslim World League — ফজর ১৮°, এশা ১৭°",
        "Umm Al-Qura University, Makkah — ফজর ১৮.৫°, এশা মাগরিবের ৯০ মিনিট পর",
        "Egyptian General Authority of Survey — ফজর ১৯.৫°, এশা ১৭.৫°",
      ],
    },
  ],
  faqs: [
    {
      q: "How accurate are the prayer times shown in Noor?",
      a: "Noor uses your device GPS or IP location with the University of Islamic Sciences, Karachi calculation method by default (changeable in Settings), computed by the Aladhan service. Calculated times can differ from printed local mosque timetables by a few minutes, so cross-check with your local mosque for exact jama'ah times.",
    },
    {
      q: "Why do different apps show slightly different prayer times?",
      a: "Apps differ in Fajr/Isha angles (Muslim World League 18°/17°, ISNA 15°/15°, Umm al-Qura 18.5°/90 min after Maghrib) and Asr madhab (Shafi'i vs Hanafi). All are valid; pick the method your local scholars follow.",
    },
    {
      q: "What is the ruling on missing a prayer?",
      a: "Deliberately abandoning prayer is a major sin. If missed due to sleep or forgetfulness, the Prophet ﷺ said to pray it as soon as one wakes up or remembers (Sahih Bukhari 597).",
    },
    {
      q: "Can I pray Isha late at night?",
      a: "Isha is valid from after twilight until true dawn, but the Prophet ﷺ preferred it before the middle of the night. Delaying without excuse is disliked.",
    },
    {
      q: "Does Noor send Athan notifications?",
      a: "Yes. Tap the bell icon on the Prayer Times page to enable Athan audio and pre-prayer reminders for each of the five prayers individually.",
    },
  ],
  sources: [
    { label: "Qur'an", detail: "Surah An-Nisa 4:103, Surah Al-Baqarah 2:238" },
    { label: "Sahih Bukhari", detail: "Book of Times of Prayer (Kitab Mawaqit as-Salah)" },
    { label: "Sahih Muslim", detail: "Book of Prayer (Kitab as-Salah)" },
    { label: "Aladhan.com API", detail: "Astronomical calculations for prayer times" },
  ],
  related: [
    { label: "Prayer Guide (How to pray)", to: "/prayer-guide" },
    { label: "Qibla Finder", to: "/qibla" },
    { label: "Islamic Calendar", to: "/calendar" },
    { label: "Daily Duas", to: "/dua" },
    { label: "Tasbih & Dhikr", to: "/tasbih" },
    { label: "Read Qur'an", to: "/quran" },
  ],
  variant: "dark",
};

export const qiblaContent: IslamicEducationalSectionProps = {
  title: "What is the Qibla & How to Use the Compass",
  intro: [
    "The Qibla is the direction every Muslim faces during prayer — towards the Kaʿbah inside the Sacred Mosque (Masjid al-Haram) in Makkah, Saudi Arabia. Facing the Qibla is a condition (shart) for the validity of Salah.",
    "Noor calculates the exact bearing from your current location to Makkah using great-circle geometry and rotates the compass needle using your device's magnetometer.",
  ],
  sections: [
    {
      heading: "The Ruling on Facing the Qibla",
      paragraphs: [
        "Allah says: \"So turn your face toward al-Masjid al-Haram. And wherever you [believers] are, turn your faces toward it.\" (Surah Al-Baqarah 2:144).",
        "The Qibla was changed from Bayt al-Maqdis (Jerusalem) to the Kaʿbah in the second year after Hijrah, and every Muslim has faced it ever since.",
      ],
    },
    {
      heading: "How the Qibla Compass Works",
      paragraphs: [
        "The app reads your GPS coordinates, computes the initial bearing from you to Makkah (21.4225°N, 39.8262°E) using the spherical law of cosines, then subtracts your device heading to point the arrow at the Kaʿbah in real time.",
        "Rotate your phone slowly on a flat surface. When the arrow aligns with the marker at the top, you are facing the Qibla.",
      ],
    },
    {
      heading: "Compass Limitations & Accuracy Tips",
      paragraphs: [
        "Phone magnetometers are affected by metal objects, magnetic cases, speakers, laptops, cars, and buildings with steel frames. Calibrate by moving your phone in a figure-8 pattern several times.",
        "GPS accuracy also affects the bearing. Always cross-check with the sun (west in the morning for South Asia) or with a nearby mosque's mihrab when possible.",
      ],
      list: [
        "Remove magnetic phone cases and stands",
        "Step away from cars, refrigerators, and steel structures",
        "Enable high-accuracy location in your device settings",
        "Recalibrate the compass in the outdoors under open sky",
      ],
    },
    {
      heading: "If You Cannot Determine the Qibla",
      paragraphs: [
        "If you have made your best effort and cannot verify the direction (e.g. at sea, in an unfamiliar city, or when the compass fails), the scholars agree your prayer is valid in the direction you sincerely judge to be correct (Sahih Bukhari 401).",
      ],
    },
    {
      heading: "প্রযুক্তিগত ব্যাখ্যা: দিকটি যেভাবে হিসাব হয়",
      paragraphs: [
        "পৃথিবীকে গোলক ধরে আপনার অবস্থান থেকে কাবা শরীফ (অক্ষাংশ ২১.৪২২৫° উত্তর, দ্রাঘিমাংশ ৩৯.৮২৬২° পূর্ব) পর্যন্ত সবচেয়ে ছোট পথটি হলো মহাবৃত্তের (great circle) চাপ। কিবলার দিক হলো সেই মহাবৃত্তের প্রাথমিক বিয়ারিং (initial bearing) — যাত্রা শুরুর মুহূর্তে সঠিক উত্তর দিক থেকে ঘড়ির কাঁটার দিকে মাপা কোণ। সমতল মানচিত্রে সোজা রেখা টানলে যে দিক পাওয়া যায়, তা থেকে এই দিক আলাদা হতে পারে — বিশেষ করে দূরের মহাদেশ থেকে; অ্যাপ মহাবৃত্তের দিকটিই ব্যবহার করে।",
        "হিসাবটি হয় ত্রিকোণমিতিক সূত্রে। Δλ = কাবার দ্রাঘিমাংশ − আপনার দ্রাঘিমাংশ হলে: x = sin(Δλ), এবং y = cos(আপনার অক্ষাংশ) × tan(কাবার অক্ষাংশ) − sin(আপনার অক্ষাংশ) × cos(Δλ)। তারপর বিয়ারিং = atan2(x, y), যাকে ০–৩৬০° পরিসরে রূপান্তর করা হয়। একই সঙ্গে Haversine সূত্রে কাবা থেকে আপনার মহাবৃত্ত-দূরত্বও (কিলোমিটারে) দেখানো হয়।",
        "কম্পাসের তির ঠিক রাখতে অ্যাপ ফোনের magnetometer থেকে পাওয়া ডিভাইসের মুখের দিক (heading) বিয়ারিং থেকে বিয়োগ করে — ফলে ফোন ঘোরালেও তিরটি কাবার দিকেই ইশারা করে। iOS ডিভাইসে কম্পাস ব্যবহারের জন্য আলাদা অনুমতি চাওয়া হতে পারে।",
        "নির্ভুলতা দুটি বিষয়ের ওপর নির্ভর করে। এক, GPS অবস্থান: অবস্থান ভুল হলে বিয়ারিংও ভুল হবে, এবং মক্কার যত কাছে থাকবেন, একই অবস্থান-ভুলের প্রভাব তত বেশি পড়বে। দুই, magnetometer: ধাতব বস্তু, চুম্বকীয় ফোন-কভার, গাড়ি বা ইস্পাতের কাঠামোর কাছে কাঁটা কয়েক ডিগ্রি পর্যন্ত সরে যেতে পারে — এসব থেকে দূরে, খোলা জায়গায় ফোনটিকে 8-আকৃতিতে ঘুরিয়ে calibrate করে নিলে ফল ভালো হয়।",
      ],
    },
  ],
  faqs: [
    {
      q: "Is a phone compass reliable for finding the Qibla?",
      a: "It is a useful aid, but not infallible. Magnetic interference and GPS error can shift the arrow by several degrees. Use it in conjunction with the sun's position or a local mosque whenever possible.",
    },
    {
      q: "What if I pray in the wrong direction by mistake?",
      a: "If you made a sincere effort (ijtihad) and later discovered the direction was off, your prayer is valid and does not need to be repeated (Sahih Bukhari 401; Muwatta Malik).",
    },
    {
      q: "How is the Qibla calculated from anywhere in the world?",
      a: "Using the great-circle initial bearing from your latitude/longitude to the Kaʿbah (21.4225°N, 39.8262°E). This is the shortest path over the surface of the Earth — the same method used by aviation.",
    },
    {
      q: "Do I need to face the Qibla for dua and dhikr?",
      a: "It is recommended (mustahab) but not obligatory. Only Salah requires facing the Qibla as a condition of validity.",
    },
    {
      q: "Why does the arrow keep spinning?",
      a: "Your compass needs calibration. Move the phone in a figure-8 motion for 10-15 seconds away from any metal, then hold it flat.",
    },
  ],
  sources: [
    { label: "Qur'an", detail: "Surah Al-Baqarah 2:144, 2:149-150" },
    { label: "Sahih Bukhari", detail: "Hadith 399-403 (Kitab as-Salah)" },
    { label: "Sahih Muslim", detail: "Hadith 525 on the change of Qibla" },
  ],
  related: [
    { label: "Prayer Times", to: "/prayer-times" },
    { label: "Prayer Guide", to: "/prayer-guide" },
    { label: "Duas for Travel", to: "/dua" },
    { label: "Read Qur'an", to: "/quran" },
    { label: "Tasbih & Dhikr", to: "/tasbih" },
  ],
  variant: "dark",
};

export const tasbihContent: IslamicEducationalSectionProps = {
  title: "Tasbih & Dhikr — Meaning, Benefits and Etiquette",
  intro: [
    "Tasbih literally means \"glorification\" — declaring Allah free from every imperfection by saying SubhanAllah. In common usage, tasbih also refers to the dhikr counter (misbaha) used to count remembrances after prayer.",
    "Dhikr (remembrance of Allah) is one of the easiest yet most rewarding acts of worship. The Prophet ﷺ said: \"The example of the one who remembers his Lord and the one who does not is like that of the living and the dead.\" (Sahih Bukhari 6407).",
  ],
  sections: [
    {
      heading: "The Meaning of Common Adhkar",
      paragraphs: [
        "The tasbihat recited after every obligatory prayer come from an authentic tradition of the Prophet ﷺ.",
      ],
      list: [
        "SubhanAllah (33x) — \"Glory be to Allah\" — declares Allah's perfection.",
        "Alhamdulillah (33x) — \"All praise is due to Allah\" — recognises every blessing comes from Him.",
        "Allahu Akbar (34x) — \"Allah is the Greatest\" — affirms His supremacy over all things.",
        "La ilaha illallah — \"There is no god but Allah\" — the best of all dhikr (Tirmidhi 3383).",
        "Astaghfirullah — \"I seek Allah's forgiveness\" — opens the doors of mercy and provision.",
      ],
    },
    {
      heading: "The Benefits of Dhikr",
      paragraphs: [
        "Allah says: \"Verily, in the remembrance of Allah do hearts find rest.\" (Surah Ar-Raʿd 13:28).",
        "The Prophet ﷺ said: \"Whoever says SubhanAllah 33 times, Alhamdulillah 33 times, and Allahu Akbar 34 times after every prayer — that is 100 — his sins will be forgiven even if they are like the foam of the sea.\" (Sahih Muslim 597).",
        "\"Two words are light on the tongue, heavy on the scale, and beloved to the Most Merciful: SubhanAllahi wa bihamdihi, SubhanAllahil-ʿAzim.\" (Sahih Bukhari 6682).",
      ],
    },
    {
      heading: "Etiquette (Adab) of Dhikr",
      paragraphs: [
        "Dhikr is best performed in a state of wudu, with the heart present and the tongue moving in humility.",
      ],
      list: [
        "Prefer counting on the fingers of the right hand — this was the Prophet's ﷺ practice (Abu Dawud 1502).",
        "Recite slowly and reflect on the meaning; quantity without presence has less reward.",
        "Do not raise the voice in a way that disturbs others (Surah Al-Aʿraf 7:205).",
        "The best times: after obligatory prayers, morning and evening, before sleep, and during travel.",
      ],
    },
    {
      heading: "Using the Digital Tasbih",
      paragraphs: [
        "A phone tasbih is a valid tool for counting — the reward is in the dhikr itself, not the counter. Choose a dhikr, tap to count, and reset when you complete the target. Sound and vibration feedback can be toggled off to preserve khushuʿ.",
      ],
    },
    {
      heading: "প্রযুক্তিগত ব্যাখ্যা: এই কাউন্টার যেভাবে কাজ করে",
      paragraphs: [
        "বড় বোতামটিতে প্রতিটি ট্যাপে নির্বাচিত যিকিরের গণনা ১ করে বাড়ে। ছয়টি প্রিসেট যিকির আছে — সুবহানাল্লাহ (লক্ষ্য ৩৩), আলহামদুলিল্লাহ (লক্ষ্য ৩৩), আল্লাহু আকবার (লক্ষ্য ৩৪), লা ইলাহা ইল্লাল্লাহ (লক্ষ্য ১০০), আস্তাগফিরুল্লাহ (লক্ষ্য ১০০) এবং সুবহানাল্লাহি ওয়া বিহামদিহি (লক্ষ্য ১০০)। বৃত্তাকার অগ্রগতির বলয়টি দেখায় লক্ষ্যের কত অংশ শেষ হলো; লক্ষ্য পূর্ণ হলে অ্যাপ জানিয়ে দেয়। প্রতিটি ট্যাপে Web Audio প্রযুক্তিতে ছোট্ট ক্লিক শব্দ হয় এবং সমর্থিত ডিভাইসে ৩০ মিলিসেকেন্ডের হালকা কম্পন হয় — দুটিই টগল দিয়ে বন্ধ করা যায়।",
        "কী সংরক্ষিত থাকে আর কী থাকে না: 'আজকের মোট' গণনা আপনার ব্রাউজারের local storage-এ সংরক্ষিত হয়, তাই পেজ বন্ধ করে আবার এলেও আজকের মোট থেকে যায়; তারিখ বদলে গেলে নতুন দিনে প্রথম খোলার সময় মোট আবার ০ থেকে শুরু হয়। তবে বর্তমান যিকিরের চলমান গণনা শুধু মেমোরিতে থাকে — যিকির বদলালে বা Reset চাপলে তা ০ হয়ে যায়, আর পেজ রিলোড করলেও চলমান গণনা আবার শুরু থেকে গুনতে হয়। কোনো গণনাই সার্ভারে পাঠানো হয় না; সব হিসাব আপনার ডিভাইসেই থাকে।",
      ],
    },
  ],
  faqs: [
    {
      q: "Is it permissible to use a digital tasbih counter?",
      a: "Yes. Contemporary scholars agree that any counting aid (fingers, beads, or a digital counter) is permissible. The Prophet ﷺ preferred fingers, but did not prohibit other means.",
    },
    {
      q: "What is the difference between Tasbih, Tahmid, and Takbir?",
      a: "Tasbih = SubhanAllah (glorification). Tahmid = Alhamdulillah (praise). Takbir = Allahu Akbar (magnification). Together they are called al-Baqiyat as-Salihat — \"the enduring good deeds\" (Surah Al-Kahf 18:46).",
    },
    {
      q: "How many times should I do dhikr each day?",
      a: "There is no fixed maximum. The recommended minimum is the post-prayer tasbihat (33+33+34) after every fard prayer, plus morning and evening adhkar. More is always better.",
    },
    {
      q: "Can I do dhikr while walking or working?",
      a: "Yes. Silent dhikr of the heart and tongue is permitted at any time — while walking, driving, cooking, or lying down. Allah says: \"...those who remember Allah standing, sitting, and [lying] on their sides.\" (Surah Ali ʿImran 3:191).",
    },
    {
      q: "Does the tasbih count reset overnight?",
      a: "Noor's \"Today's Total\" resets at local midnight so you can track a daily habit. The current dhikr counter resets when you tap Reset or when you switch dhikr.",
    },
  ],
  sources: [
    { label: "Qur'an", detail: "Surah Ar-Raʿd 13:28, Ali ʿImran 3:191, Al-Ahzab 33:41-42" },
    { label: "Sahih Bukhari", detail: "Hadith 6407, 6682, 843" },
    { label: "Sahih Muslim", detail: "Hadith 597 (post-prayer tasbihat)" },
    { label: "Sunan Abu Dawud", detail: "Hadith 1502 (counting on the fingers)" },
  ],
  related: [
    { label: "99 Names of Allah", to: "/99-names" },
    { label: "Daily Duas", to: "/dua" },
    { label: "Prayer Times", to: "/prayer-times" },
    { label: "Read Qur'an", to: "/quran" },
    { label: "Hadith Collections", to: "/hadith" },
  ],
  variant: "dark",
};

export const quizContent: IslamicEducationalSectionProps = {
  title: "Islamic Quiz — Educational Purpose & How to Learn",
  intro: [
    "The Noor Islamic Quiz is a free daily learning tool that helps Muslims of all ages test and grow their knowledge of the Qur'an, Hadith, Seerah, Fiqh basics and Islamic history through short multiple-choice questions.",
    "Seeking knowledge is a religious obligation. The Prophet ﷺ said: \"Seeking knowledge is an obligation upon every Muslim.\" (Sunan Ibn Majah 224, graded Sahih).",
  ],
  sections: [
    {
      heading: "Educational Purpose",
      paragraphs: [
        "The quiz is designed as an aid — not a substitute — for authentic study under qualified teachers. Every question is drawn from well-known Islamic sources (Qur'an, Sahih Bukhari, Sahih Muslim, Seerah of Ibn Hisham and Ibn Kathir's Tafsir).",
        "Regular short quizzes are proven to strengthen long-term retention far better than passive reading — a technique known as \"retrieval practice\" in educational research.",
      ],
    },
    {
      heading: "How to Learn from the Quiz",
      paragraphs: [
        "Approach every question with the intention of learning, not just scoring. Read the explanation after each answer and note anything unfamiliar.",
      ],
      list: [
        "Play daily — 5 questions a day builds a habit without fatigue.",
        "Read the source when a question references a Qur'anic verse or hadith.",
        "Discuss unclear answers with a knowledgeable person before drawing conclusions.",
        "Repeat missed questions on later days — repetition consolidates memory.",
        "Combine the quiz with reading the Qur'an with tafsir for deeper understanding.",
      ],
    },
    {
      heading: "Categories Covered",
      paragraphs: [
        "Questions rotate across foundational topics so learners get balanced exposure.",
      ],
      list: [
        "Qur'an — Surahs, verses, revelation contexts",
        "Hadith — famous narrations from the six major collections",
        "Seerah — the life of the Prophet Muhammad ﷺ",
        "Aqidah (creed) and pillars of Islam & iman",
        "Fiqh basics — prayer, fasting, zakat, hajj",
        "Islamic history — Sahaba, caliphs, key events",
      ],
    },
    {
      heading: "Gamification & Motivation",
      paragraphs: [
        "XP, streaks and badges are motivational tools, not the goal itself. The real reward is the knowledge you gain and the intention (niyyah) with which you seek it.",
      ],
    },
  ],
  faqs: [
    {
      q: "Where do the quiz questions come from?",
      a: "Every question is written or reviewed against classical sources: the Qur'an, Sahih Bukhari, Sahih Muslim, the four Sunan collections, and mainstream Seerah works (Ibn Hisham, Ar-Raheeq al-Makhtum). Weak or fabricated narrations are excluded.",
    },
    {
      q: "Is the quiz suitable for children?",
      a: "Yes. Questions are family-friendly and cover general Islamic knowledge appropriate for ages 8+. Parents may want to play alongside younger children to explain the context of each answer.",
    },
    {
      q: "How is my daily quiz score used?",
      a: "Your XP, streak and unlocked badges are stored on your device so you can track progress. Nothing is shared publicly without your action.",
    },
    {
      q: "Do I earn a certificate?",
      a: "Yes — once you unlock the Quran Expert badge (2,000+ XP with 85%+ accuracy), you can generate a personalised certificate directly from the badges tab.",
    },
    {
      q: "How many questions are in the pool?",
      a: "Noor's question bank contains 281 unique questions and rotates 5 new ones each day so you can play consistently for months without repetition.",
    },
    {
      q: "Are the answers verified by scholars?",
      a: "Answers are based on mainstream Sunni scholarship. For matters of legal ruling or contested opinions, always consult a qualified local scholar.",
    },
  ],
  sources: [
    { label: "Qur'an", detail: "Primary source for all creed and worship questions" },
    { label: "Sahih Bukhari & Sahih Muslim", detail: "Two major Hadith compilations; numbering and scholarly descriptions can vary by edition and tradition" },
    { label: "Sunan Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah", detail: "The four Sunan of the six major collections" },
    { label: "Seerah works", detail: "Ibn Hisham, Ibn Kathir's Al-Bidayah wa an-Nihayah, Ar-Raheeq al-Makhtum" },
  ],
  related: [
    { label: "Read Qur'an", to: "/quran" },
    { label: "Hadith Collections", to: "/hadith" },
    { label: "Islamic Stories", to: "/stories" },
    { label: "99 Names of Allah", to: "/99-names" },
    { label: "Daily Duas", to: "/dua" },
  ],
  variant: "light",
};

export const calendarContent: IslamicEducationalSectionProps = {
  title: "হিজরি ক্যালেন্ডার যেভাবে হিসাব করা হয়",
  intro: [
    "এই পেজে গ্রেগরীয় তারিখ থেকে হিজরি তারিখ বের করা হয় একটি গাণিতিক (arithmetic) পদ্ধতিতে — সরাসরি চাঁদ দেখার ওপর ভিত্তি করে নয়। ফলে এটি একটি নির্ভরযোগ্য আনুমানিক রূপান্তর, যার সঙ্গে স্থানীয়ভাবে ঘোষিত হিজরি তারিখের ১-২ দিনের পার্থক্য হতে পারে।",
  ],
  sections: [
    {
      heading: "গাণিতিক হিজরি ক্যালেন্ডার (Tabular Islamic Calendar)",
      paragraphs: [
        "পদ্ধতিটির ভিত্তি ৩০ বছরের একটি চক্র, যেখানে মোট দিন ১০,৬৩১। প্রতি বছরে ১২টি মাস থাকে; বিজোড় মাসগুলো ৩০ দিনের ও জোড় মাসগুলো ২৯ দিনের হয়, আর চক্রের ১১টি অধিবর্ষে শেষ মাস (জিলহজ) ২৯-এর বদলে ৩০ দিনের হয়। এভাবে গড় মাসের দৈর্ঘ্য দাঁড়ায় প্রায় ২৯.৫৩ দিন, যা চাঁদের প্রকৃত আবর্তনকালের খুব কাছাকাছি। এই নিয়মভিত্তিক পদ্ধতিটি মধ্যযুগের মুসলিম জ্যোতির্বিজ্ঞানীদের তৈরি, যাতে পর্যবেক্ষণ ছাড়াই যেকোনো তারিখ আগাম হিসাব করা যায়।",
        "অ্যাপের হিসাবের ধাপ তিনটি: প্রথমে গ্রেগরীয় তারিখকে Julian Day Number-এ রূপান্তর করা হয়, তারপর হিজরি যুগের শুরু (১ মুহাররম, ১ হিজরি) থেকে অতিক্রান্ত দিন গুনে ৩০-বছরের চক্রের সূত্রে বছর, মাস ও দিন বের করা হয়। প্রতিটি ধাপ পূর্ণসংখ্যার গাণিতিক সূত্রে হয়, তাই একই গ্রেগরীয় তারিখের জন্য ফল প্রতিবার একই আসে (reproducible) — কোনো সার্ভার বা ইন্টারনেট ছাড়াই হিসাবটি আপনার ডিভাইসেই সম্পন্ন হয়।",
      ],
    },
    {
      heading: "হিসাবি তারিখ বনাম চাঁদ দেখার তারিখ",
      paragraphs: [
        "বেশিরভাগ দেশে ধর্মীয় অনুষ্ঠানের তারিখ নির্ধারিত হয় চাঁদ দেখা কিংবা সরকারি ঘোষণা অনুযায়ী — যেমন সৌদি আরবের Umm al-Qura ক্যালেন্ডার, যা চাঁদের প্রকৃত গতিবিধি বিবেচনা করে তৈরি। গাণিতিক ক্যালেন্ডার চাঁদের প্রকৃত অবস্থান দেখে না বলে রমজান, ঈদুল ফিতর বা ঈদুল আযহার ঘোষিত তারিখ এই পেজের তারিখের চেয়ে ১-২ দিন আগে-পরে হতে পারে। ধর্মীয় পালনের ক্ষেত্রে স্থানীয় ঘোষণাই অনুসরণ করুন; এই পেজের তারিখ পরিকল্পনা ও আনুমানিক ধারণার জন্য ব্যবহার করুন।",
      ],
    },
    {
      heading: "এই পেজে যা যা পাবেন",
      paragraphs: [],
      list: [
        "আজকের হিজরি তারিখ — বাংলা সংখ্যায়, মাস ও বছরসহ",
        "১২টি হিজরি মাসের তালিকা — বর্তমান মাসটি চিহ্নিত অবস্থায়",
        "গুরুত্বপূর্ণ ইসলামি তারিখের তালিকা (আশুরা, ঈদুল ফিতর, আরাফাতের দিন, ঈদুল আযহা প্রভৃতি) — সবই একই গাণিতিক পদ্ধতিতে হিসাব করা",
      ],
    },
  ],
  faqs: [
    {
      q: "এই হিজরি তারিখ কি সবসময় হুবহু সঠিক?",
      a: "এটি গাণিতিক হিসাব — সাধারণত নির্ভুল, তবে চাঁদ দেখার ভিত্তিতে ঘোষিত তারিখের সঙ্গে ১-২ দিনের পার্থক্য হতে পারে। ধর্মীয় পালনে স্থানীয় ঘোষণা অনুসরণ করুন।",
    },
    {
      q: "হিজরি বছর গ্রেগরীয় বছরের চেয়ে ছোট কেন?",
      a: "হিজরি বছর চান্দ্র — ৩৫৪ বা ৩৫৫ দিন; গ্রেগরীয় বছর সৌর — ৩৬৫ বা ৩৬৬ দিন। পার্থক্য প্রায় ১১ দিন, তাই প্রতি বছর হিজরি তারিখগুলো গ্রেগরীয় ক্যালেন্ডারে প্রায় ১১ দিন করে এগিয়ে আসে।",
    },
    {
      q: "অধিবর্ষে কোন মাসে দিন বাড়ে?",
      a: "শেষ মাস জিলহজে — ২৯-এর বদলে ৩০ দিন হয়। ৩০ বছরের চক্রে এমন অধিবর্ষ থাকে ১১টি।",
    },
  ],
  sources: [
    { label: "Tabular Islamic calendar", detail: "Arithmetic Hijri calendar: 30-year cycle, 10,631 days, 11 leap years; tabular dates can differ 1-2 days from observation-based calendars (Wikipedia, accessed 2026-10-22)" },
    { label: "Noor App implementation", detail: "Gregorian -> Julian Day Number -> Hijri conversion performed locally in IslamicCalendarPage" },
  ],
  related: [
    { label: "Prayer Times", to: "/prayer-times" },
    { label: "Qibla Finder", to: "/qibla" },
    { label: "Tasbih & Dhikr", to: "/tasbih" },
    { label: "Daily Duas", to: "/dua" },
  ],
  variant: "light",
};