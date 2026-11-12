// Islamic event catalog — the governed source of event windows.
//
// Every entry is CALCULATED (confirmation: "calculated", source: "tabular"):
// the dates come from the tabular Hijri conversion, not from a moon
// sighting. No entry is ever marked "confirmed" in code — confirmation can
// only come from an admin correction (corrections.ts) after a local sighting
// is recorded. Never hardcode an uncertain date as universally confirmed.
//
// Laylatul Qadr is a WINDOW (Ramadan 21-30), never a fixed night: the exact
// night is not fixed, and the engine must never claim it. This replaces the
// old page's fixed "Ramadan 27" listing (the one intentional content
// correction of Phase 4 — see PHASE4-CALENDAR-ENGINE.md).
//
// Month windows (Ramadan, Dhul Hijjah, Rabi-ul-Awwal) exist so the context
// engine can answer "which month are we in" as well as "which day is it".
// Window entries may overlap single-day entries (e.g. Arafah sits inside
// the Hajj window and the first-ten-days window) — the context engine
// returns ALL active windows; overlap is intended, not a conflict.

import { HIJRI_MONTHS_BN, getBengaliNumber } from "./hijri.js";

export type EventType = "eid" | "fasting" | "special" | "celebration";
export type ConfirmationStatus = "calculated" | "confirmed";

export interface IslamicEventDef {
  /** Stable slug, used as the event identity in logs and recommendations. */
  id: string;
  slug: string;
  /** Hijri month (1-12) the window lives in. */
  hijriMonth: number;
  /** Inclusive Hijri day range of the window. */
  hijriDayStart: number;
  hijriDayEnd: number;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  type: EventType;
  /** Always "calculated" in code. Only an admin correction can confirm. */
  confirmation: ConfirmationStatus;
  /** Where the date came from. */
  source: "tabular";
  /** Bengali note shown where the entry needs a caveat (e.g. Qadr). */
  noteBn?: string;
}


export const ISLAMIC_EVENTS: readonly IslamicEventDef[] = [
  // --- The ten entries from the /calendar page, unchanged except Qadr ---
  {
    id: "islamic-new-year",
    slug: "islamic-new-year",
    hijriMonth: 1,
    hijriDayStart: 1,
    hijriDayEnd: 1,
    nameBn: "হিজরি নববর্ষ",
    nameEn: "Islamic New Year",
    descriptionBn: "ইসলামি বর্ষপঞ্জির প্রথম দিন",
    type: "celebration",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "ashura",
    slug: "ashura",
    hijriMonth: 1,
    hijriDayStart: 10,
    hijriDayEnd: 10,
    nameBn: "আশুরা",
    nameEn: "Ashura",
    descriptionBn: "মুহাররম মাসের ১০ তারিখ, রোজা রাখা সুন্নত",
    type: "fasting",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "mawlid",
    slug: "mawlid",
    hijriMonth: 3,
    hijriDayStart: 12,
    hijriDayEnd: 12,
    nameBn: "ঈদে মিলাদুন্নবী",
    nameEn: "Mawlid an-Nabi",
    descriptionBn: "রাসূলুল্লাহ (সাঃ) এর জন্মদিন",
    type: "celebration",
    confirmation: "calculated",
    source: "tabular",
    noteBn: "প্রচলিত তারিখ; প্রকৃত পালন স্থানীয় চাঁদ দেখার উপর নির্ভর করে।",
  },
  {
    id: "miraj",
    slug: "miraj",
    hijriMonth: 7,
    hijriDayStart: 27,
    hijriDayEnd: 27,
    nameBn: "শবে মেরাজ",
    nameEn: "Isra and Mi'raj",
    descriptionBn: "রাসূলুল্লাহ (সাঃ) এর মেরাজের রাত",
    type: "special",
    confirmation: "calculated",
    source: "tabular",
    noteBn: "প্রচলিত তারিখ; প্রকৃত পালন স্থানীয় চাঁদ দেখার উপর নির্ভর করে।",
  },
  {
    id: "shabe-barat",
    slug: "shabe-barat",
    hijriMonth: 8,
    hijriDayStart: 15,
    hijriDayEnd: 15,
    nameBn: "শবে বরাত",
    nameEn: "Mid-Sha'ban",
    descriptionBn: "ভাগ্য রজনী, ক্ষমা প্রার্থনার রাত",
    type: "special",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "ramadan-start",
    slug: "ramadan-start",
    hijriMonth: 9,
    hijriDayStart: 1,
    hijriDayEnd: 1,
    nameBn: "রমজান শুরু",
    nameEn: "Start of Ramadan",
    descriptionBn: "পবিত্র রমজান মাসের প্রথম দিন",
    type: "fasting",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "laylatul-qadr",
    slug: "laylatul-qadr",
    hijriMonth: 9,
    hijriDayStart: 21,
    hijriDayEnd: 30,
    nameBn: "শবে কদর",
    nameEn: "Laylat al-Qadr",
    descriptionBn: "হাজার মাসের চেয়ে উত্তম রাত",
    type: "special",
    confirmation: "calculated",
    source: "tabular",
    noteBn: "শবে কদরের নির্দিষ্ট রাত জানা যায় না — শেষ দশ রাতের বেজোড় রাতে এর সন্ধান করা হয়।",
  },
  {
    id: "eid-fitr",
    slug: "eid-fitr",
    hijriMonth: 10,
    hijriDayStart: 1,
    hijriDayEnd: 1,
    nameBn: "ঈদুল ফিতর",
    nameEn: "Eid al-Fitr",
    descriptionBn: "রমজান শেষে আনন্দের ঈদ",
    type: "eid",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "arafah",
    slug: "arafah",
    hijriMonth: 12,
    hijriDayStart: 9,
    hijriDayEnd: 9,
    nameBn: "আরাফাতের দিন",
    nameEn: "Day of Arafah",
    descriptionBn: "হজের সবচেয়ে গুরুত্বপূর্ণ দিন, রোজা রাখা সুন্নত",
    type: "fasting",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "eid-adha",
    slug: "eid-adha",
    hijriMonth: 12,
    hijriDayStart: 10,
    hijriDayEnd: 10,
    nameBn: "ঈদুল আযহা",
    nameEn: "Eid al-Adha",
    descriptionBn: "কুরবানির ঈদ",
    type: "eid",
    confirmation: "calculated",
    source: "tabular",
  },
  // --- Event windows added by Phase 4 (mission requirement) ---
  {
    id: "ramadan-month",
    slug: "ramadan-month",
    hijriMonth: 9,
    hijriDayStart: 1,
    hijriDayEnd: 30,
    nameBn: "রমজান মাস",
    nameEn: "Month of Ramadan",
    descriptionBn: "পবিত্র রমজান মাস",
    type: "fasting",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "last-ten-nights",
    slug: "last-ten-nights",
    hijriMonth: 9,
    hijriDayStart: 21,
    hijriDayEnd: 30,
    nameBn: "রমজানের শেষ দশ রাত",
    nameEn: "Last Ten Nights of Ramadan",
    descriptionBn: "রমজানের শেষ দশ রাত — ইতিকাফ ও ইবাদতের রাতগুলো",
    type: "special",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "first-ten-dhul-hijjah",
    slug: "first-ten-dhul-hijjah",
    hijriMonth: 12,
    hijriDayStart: 1,
    hijriDayEnd: 10,
    nameBn: "জিলহজের প্রথম দশ দিন",
    nameEn: "First Ten Days of Dhul Hijjah",
    descriptionBn: "জিলহজ মাসের প্রথম দশ দিন",
    type: "fasting",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "hajj",
    slug: "hajj",
    hijriMonth: 12,
    hijriDayStart: 8,
    hijriDayEnd: 13,
    nameBn: "হজ",
    nameEn: "Hajj",
    descriptionBn: "হজের দিনগুলো — আরাফাত, ঈদুল আযহা ও তাশরিকের দিন",
    type: "special",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "dhul-hijjah-month",
    slug: "dhul-hijjah-month",
    hijriMonth: 12,
    hijriDayStart: 1,
    hijriDayEnd: 30,
    nameBn: "জিলহজ মাস",
    nameEn: "Month of Dhul Hijjah",
    descriptionBn: "হজ ও কুরবানির মাস",
    type: "special",
    confirmation: "calculated",
    source: "tabular",
  },
  {
    id: "rabi-ul-awwal-month",
    slug: "rabi-ul-awwal-month",
    hijriMonth: 3,
    hijriDayStart: 1,
    hijriDayEnd: 30,
    nameBn: "রবিউল আউয়াল মাস",
    nameEn: "Month of Rabi al-Awwal",
    descriptionBn: "রাসূলুল্লাহ (সাঃ) এর জন্মের মাস",
    type: "celebration",
    confirmation: "calculated",
    source: "tabular",
  },
];

export interface CalendarPageEvent {
  id: string;
  slug: string;
  /** Bengali month name, e.g. "রমজান". */
  monthBn: string;
  /** Display label, e.g. "২৭ রজব" or "২১–৩০ রমজান". */
  dayLabel: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  type: EventType;
  noteBn?: string;
}

/** Display rows for the /calendar page, in catalog order. */
export function getCalendarPageEvents(): CalendarPageEvent[] {
  return ISLAMIC_EVENTS.map((e) => {
    const monthBn = HIJRI_MONTHS_BN[e.hijriMonth - 1];
    const dayLabel =
      e.hijriDayStart === e.hijriDayEnd
        ? `${getBengaliNumber(e.hijriDayStart)} ${monthBn}`
        : `${getBengaliNumber(e.hijriDayStart)}–${getBengaliNumber(e.hijriDayEnd)} ${monthBn}`;
    return {
      id: e.id,
      slug: e.slug,
      monthBn,
      dayLabel,
      nameBn: e.nameBn,
      nameEn: e.nameEn,
      descriptionBn: e.descriptionBn,
      type: e.type,
      noteBn: e.noteBn,
    };
  });
}
