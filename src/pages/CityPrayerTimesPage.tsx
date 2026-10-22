import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BottomNavigation from "@/components/BottomNavigation";
import { KOLKATA } from "@/lib/cityPages";
import { getCityDayTimes, getCityMonthTimes, todayInCity } from "@/lib/cityPrayerTimes";

/**
 * P2 pilot — Kolkata prayer-times page (/prayer-times/kolkata).
 *
 * Reachable only while CITY_PAGES_ENABLED is true (see src/lib/cityPages.ts);
 * the flag ships OFF. Times are calculated locally in the browser with the
 * `adhan` library (MIT): Karachi method (Fajr 18°, Isha 18°) + Hanafi Asr.
 * No data is fetched from a server for the table.
 */

const SITE_ORIGIN = "https://noorapp.in";
const city = KOLKATA;

const bn = (n: number | string) =>
  String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
const bnTime = (t: string) => bn(t);

const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

const PRAYERS: { key: "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha"; label: string; note?: string }[] = [
  { key: "fajr", label: "ফজর" },
  { key: "sunrise", label: "সূর্যোদয়" },
  { key: "dhuhr", label: "যোহর" },
  { key: "asr", label: "আসর", note: "হানাফি" },
  { key: "maghrib", label: "মাগরিব" },
  { key: "isha", label: "এশা" },
];

const CityPrayerTimesPage = () => {
  const today = useMemo(() => todayInCity(city), []);
  const [view, setView] = useState({ year: today.year, month: today.month });
  const todayTimes = useMemo(
    () => getCityDayTimes(city, today.year, today.month, today.day),
    [today],
  );
  const monthTimes = useMemo(
    () => getCityMonthTimes(city, view.year, view.month),
    [view],
  );
  const isCurrentMonth = view.year === today.year && view.month === today.month;

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.year, v.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  const canonicalUrl = `${SITE_ORIGIN}/prayer-times/${city.slug}`;

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <Helmet>
        <title>কলকাতার নামাজের সময় — Kolkata Prayer Times | Noor</title>
        <meta
          name="description"
          content="কলকাতা (পশ্চিমবঙ্গ) এর জন্য প্রতিদিনের নামাজের সময় ও পুরো মাসের সময়সূচি — ফজর, সূর্যোদয়, যোহর, আসর (হানাফি), মাগরিব, এশা। হিসাব পদ্ধতি: University of Islamic Sciences, Karachi।"
        />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content="index,follow" />
      </Helmet>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold">কলকাতার নামাজের সময়</h1>
        <p className="mt-2 text-muted-foreground">
          {bn(today.day)} {MONTHS_BN[today.month - 1]} {bn(today.year)} ·{" "}
          {bn(todayTimes.hijriDay)} {todayTimes.hijriMonthName} {bn(todayTimes.hijriYear)} হিজরি ·{" "}
          {city.nameEn}, {city.region}, {city.country}
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>আজকের সময়সূচি</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PRAYERS.map((p) => (
                <div key={p.key} className="rounded-xl border border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {p.label}
                    {p.note ? <span className="text-primary"> ({p.note})</span> : null}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{bnTime(todayTimes[p.key])}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              দিনের দৈর্ঘ্য (সূর্যোদয় থেকে সূর্যাস্ত): {bn(todayTimes.dayLength.split(":")[0])} ঘণ্টা{" "}
              {bn(todayTimes.dayLength.split(":")[1])} মিনিট। সেহরির শেষ সময় ফজরের ওয়াক্ত শুরু পর্যন্ত এবং ইফতার মাগরিবের সময় — একই হিসাবের ভিত্তিতে।
            </p>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {MONTHS_BN[view.month - 1]} {bn(view.year)} — পুরো মাসের সময়সূচি
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)}>আগের মাস</Button>
                <Button variant="outline" size="sm" onClick={() => shiftMonth(1)}>পরের মাস</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-2">তারিখ</th>
                    <th className="py-2 pr-2">হিজরি</th>
                    <th className="py-2 pr-2">ফজর</th>
                    <th className="py-2 pr-2">সূর্যোদয়</th>
                    <th className="py-2 pr-2">যোহর</th>
                    <th className="py-2 pr-2">আসর (হানাফি)</th>
                    <th className="py-2 pr-2">মাগরিব</th>
                    <th className="py-2">এশা</th>
                  </tr>
                </thead>
                <tbody>
                  {monthTimes.map((d) => {
                    const isToday = isCurrentMonth && d.day === today.day;
                    return (
                      <tr
                        key={d.day}
                        className={`border-b border-border/50 ${isToday ? "bg-primary/10 font-semibold" : ""}`}
                      >
                        <td className="py-1.5 pr-2">{bn(d.day)}</td>
                        <td className="py-1.5 pr-2">{bn(d.hijriDay)} {d.hijriMonthName}</td>
                        <td className="py-1.5 pr-2">{bnTime(d.fajr)}</td>
                        <td className="py-1.5 pr-2">{bnTime(d.sunrise)}</td>
                        <td className="py-1.5 pr-2">{bnTime(d.dhuhr)}</td>
                        <td className="py-1.5 pr-2">{bnTime(d.asr)}</td>
                        <td className="py-1.5 pr-2">{bnTime(d.maghrib)}</td>
                        <td className="py-1.5">{bnTime(d.isha)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>হিসাব পদ্ধতি ও স্বচ্ছতা</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>
              এই পেজের সব সময় আপনার ব্রাউজারেই হিসাব করা হয় — কোনো সার্ভার থেকে সময় আনা হয় না।
              হিসাবের ভিত্তি কলকাতার স্থানাঙ্ক (অক্ষাংশ {bn("22.5744")}, দ্রাঘিমাংশ {bn("88.3629")}) ও
              Asia/Kolkata সময় অঞ্চল। পদ্ধতি: University of Islamic Sciences, Karachi — ফজর সূর্য
              দিগন্তের ১৮° নিচে থাকলে, এশা ১৮° নিচে গেলে। আসরের সময় হানাফি পদ্ধতিতে (বস্তুর ছায়া
              তার দৈর্ঘ্যের দ্বিগুণ হলে) — তাই মূল /prayer-times পেজের আসরের সঙ্গে এই পেজের আসরে
              পার্থক্য থাকতে পারে, কারণ সেখানে সেবার default অনুপাত ব্যবহৃত হয়।
            </p>
            <p>
              হিসাবটি করা হয় ওপেন-সোর্স <span lang="en">adhan</span> লাইব্রেরি (MIT license) দিয়ে।
              একই ইনপুটে এই হিসাবের সঙ্গে Aladhan সেবার ফলাফলের তুলনা যাচাই করা হয়েছে — ছয়টি
              সময়ের মধ্যে সর্বোচ্চ পার্থক্য ছিল ১ মিনিট (যোহরের গণনায় rounding-এর পার্থক্য)।
            </p>
            <p>
              এই সময়গুলো জ্যোতির্বিজ্ঞান-ভিত্তিক হিসাব — কলকাতার কোনো নির্দিষ্ট মসজিদের আনুষ্ঠানিক
              সময়সূচি নয়। জামাতের সময়ের জন্য স্থানীয় মসজিদের ঘোষিত সময়সূচি অনুসরণ করুন। হিজরি
              তারিখ গাণিতিক (tabular) পদ্ধতিতে হিসাব করা, তাই চাঁদ দেখার ভিত্তিতে ঘোষিত তারিখের
              সঙ্গে ১-২ দিনের পার্থক্য হতে পারে।
            </p>
          </CardContent>
        </Card>
      </div>

      <BottomNavigation />
    </div>
  );
};

export default CityPrayerTimesPage;
