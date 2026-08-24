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
        "Different Islamic authorities use slightly different angles (called Fajr/Isha angles), producing small variations. Noor uses the ISNA method (Islamic Society of North America) by default: 15° for Fajr and 15° for Isha, which is widely accepted in South Asia and North America.",
        "Dhuhr is derived from solar noon, Asr from the Shafi'i shadow-length formula, and Maghrib from sunset. Times shift by a few minutes each day as the Earth orbits the sun.",
      ],
    },
    {
      heading: "Practical Guidance",
      paragraphs: [
        "Try to pray at the beginning of each prayer window whenever possible — this is more rewarding. Allow ~2-3 minutes of buffer against your printed timetable for safety.",
        "If you miss a prayer, offer it as soon as you remember (qada). Combining or shortening prayers is only permitted while traveling under specific conditions.",
      ],
    },
  ],
  faqs: [
    {
      q: "How accurate are the prayer times shown in Noor?",
      a: "Noor uses your device GPS or IP location with the ISNA calculation method. Times match Aladhan.com and most South Asian mosque timetables within 1-2 minutes. For precise times, cross-check with your local mosque.",
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
      a: "Noor's question bank contains 315 unique questions and rotates 5 new ones each day so you can play consistently for months without repetition.",
    },
    {
      q: "Are the answers verified by scholars?",
      a: "Answers are based on mainstream Sunni scholarship. For matters of legal ruling or contested opinions, always consult a qualified local scholar.",
    },
  ],
  sources: [
    { label: "Qur'an", detail: "Primary source for all creed and worship questions" },
    { label: "Sahih Bukhari & Sahih Muslim", detail: "The two most authentic hadith compilations" },
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