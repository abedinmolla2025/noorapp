import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Star, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BottomNavigation from "@/components/BottomNavigation";
import IslamicEducationalSection from "@/components/seo/IslamicEducationalSection";
import { calendarContent } from "@/lib/pageContent/utilityPages";

// Hijri month names in Bengali
const hijriMonths = [
  "মুহাররম",
  "সফর", 
  "রবিউল আউয়াল",
  "রবিউস সানি",
  "জমাদিউল আউয়াল",
  "জমাদিউস সানি",
  "রজব",
  "শাবান",
  "রমজান",
  "শাওয়াল",
  "জিলকদ",
  "জিলহজ"
];

// Important Islamic dates
const importantDates = [
  {
    id: 1,
    month: "মুহাররম",
    day: 1,
    name: "হিজরি নববর্ষ",
    nameEn: "Islamic New Year",
    description: "ইসলামি বর্ষপঞ্জির প্রথম দিন",
    type: "celebration"
  },
  {
    id: 2,
    month: "মুহাররম",
    day: 10,
    name: "আশুরা",
    nameEn: "Ashura",
    description: "মুহাররম মাসের ১০ তারিখ, রোজা রাখা সুন্নত",
    type: "fasting"
  },
  {
    id: 3,
    month: "রবিউল আউয়াল",
    day: 12,
    name: "ঈদে মিলাদুন্নবী",
    nameEn: "Mawlid an-Nabi",
    description: "রাসূলুল্লাহ (সাঃ) এর জন্মদিন",
    type: "celebration"
  },
  {
    id: 4,
    month: "রজব",
    day: 27,
    name: "শবে মেরাজ",
    nameEn: "Isra and Mi'raj",
    description: "রাসূলুল্লাহ (সাঃ) এর মেরাজের রাত",
    type: "special"
  },
  {
    id: 5,
    month: "শাবান",
    day: 15,
    name: "শবে বরাত",
    nameEn: "Mid-Sha'ban",
    description: "ভাগ্য রজনী, ক্ষমা প্রার্থনার রাত",
    type: "special"
  },
  {
    id: 6,
    month: "রমজান",
    day: 1,
    name: "রমজান শুরু",
    nameEn: "Start of Ramadan",
    description: "পবিত্র রমজান মাসের প্রথম দিন",
    type: "fasting"
  },
  {
    id: 7,
    month: "রমজান",
    day: 27,
    name: "শবে কদর",
    nameEn: "Laylat al-Qadr",
    description: "হাজার মাসের চেয়ে উত্তম রাত",
    type: "special"
  },
  {
    id: 8,
    month: "শাওয়াল",
    day: 1,
    name: "ঈদুল ফিতর",
    nameEn: "Eid al-Fitr",
    description: "রমজান শেষে আনন্দের ঈদ",
    type: "eid"
  },
  {
    id: 9,
    month: "জিলহজ",
    day: 9,
    name: "আরাফাতের দিন",
    nameEn: "Day of Arafah",
    description: "হজের সবচেয়ে গুরুত্বপূর্ণ দিন, রোজা রাখা সুন্নত",
    type: "fasting"
  },
  {
    id: 10,
    month: "জিলহজ",
    day: 10,
    name: "ঈদুল আযহা",
    nameEn: "Eid al-Adha",
    description: "কুরবানির ঈদ",
    type: "eid"
  }
];

// Simple Gregorian to Hijri conversion (approximate)
const gregorianToHijri = (date: Date) => {
  const gregorianYear = date.getFullYear();
  const gregorianMonth = date.getMonth();
  const gregorianDay = date.getDate();
  
  // Julian Day Number calculation
  const a = Math.floor((14 - (gregorianMonth + 1)) / 12);
  const y = gregorianYear + 4800 - a;
  const m = (gregorianMonth + 1) + 12 * a - 3;
  
  const jdn = gregorianDay + Math.floor((153 * m + 2) / 5) + 365 * y + 
              Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  
  // Convert JDN to Hijri
  const l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + 
            Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - 
             Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hijriMonth = Math.floor((24 * l3) / 709);
  const hijriDay = l3 - Math.floor((709 * hijriMonth) / 24);
  const hijriYear = 30 * n + j - 30;
  
  return { year: hijriYear, month: hijriMonth, day: hijriDay };
};

const getBengaliNumber = (num: number) => {
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return num.toString().split('').map(d => bengaliDigits[parseInt(d)]).join('');
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "eid":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "fasting":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "special":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "celebration":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    default:
      return "bg-primary/20 text-primary border-primary/30";
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case "eid":
      return "🎉";
    case "fasting":
      return "🌙";
    case "special":
      return "⭐";
    case "celebration":
      return "🕌";
    default:
      return "📅";
  }
};

const IslamicCalendarPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("today");
  
  const today = new Date();
  const hijriDate = gregorianToHijri(today);
  
  const weekDays = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
  const gregorianMonths = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", 
                          "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

  const SITE_ORIGIN = "https://noorapp.in";
  const canonicalUrl = `${SITE_ORIGIN}/calendar`;
  const pageTitle = "Islamic Calendar — হিজরি ক্যালেন্ডার | NOOR";
  const pageDescription = "View today's Hijri date and important Islamic events — আজকের হিজরি তারিখ ও গুরুত্বপূর্ণ ইসলামিক দিবসগুলো জানুন। Complete Hijri calendar for Muslims.";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-24">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={`${SITE_ORIGIN}/og-calendar.png`} />
      </Helmet>
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <button 
            onClick={() => navigate("/")}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold">ইসলামিক ক্যালেন্ডার</h1>
            <p className="text-sm text-muted-foreground">হিজরি তারিখ ও দিবস</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Today's Date Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-gradient-to-br from-primary/20 via-primary/10 to-background border-primary/20 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Sun size={16} />
                    {weekDays[today.getDay()]}
                  </p>
                  <div className="space-y-1">
                    <h2 className="text-3xl font-bold text-primary">
                      {getBengaliNumber(hijriDate.day)} {hijriMonths[hijriDate.month - 1]}
                    </h2>
                    <p className="text-lg text-foreground/80">
                      {getBengaliNumber(hijriDate.year)} হিজরি
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getBengaliNumber(today.getDate())} {gregorianMonths[today.getMonth()]} {getBengaliNumber(today.getFullYear())}
                  </p>
                </div>
                <div className="text-6xl">🕌</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50">
            <TabsTrigger value="today" className="flex items-center gap-2">
              <Calendar size={16} />
              দিবস সমূহ
            </TabsTrigger>
            <TabsTrigger value="months" className="flex items-center gap-2">
              <Moon size={16} />
              মাস সমূহ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="mt-4 space-y-3">
            {importantDates.map((date, index) => (
              <motion.div
                key={date.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`border ${getTypeColor(date.type)} bg-card/50 hover:bg-card/80 transition-all`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{getTypeIcon(date.type)}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-foreground">{date.name}</h3>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                            {getBengaliNumber(date.day)} {date.month}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{date.nameEn}</p>
                        <p className="text-sm text-foreground/80">{date.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </TabsContent>

          <TabsContent value="months" className="mt-4">
            <div className="grid grid-cols-2 gap-3">
              {hijriMonths.map((month, index) => (
                <motion.div
                  key={month}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card className={`border hover:border-primary/50 transition-all cursor-pointer ${
                    hijriDate.month === index + 1 ? "border-primary bg-primary/10" : "bg-card/50"
                  }`}>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl mb-2">
                        {index === 8 ? "🌙" : index === 11 ? "🕋" : "📅"}
                      </div>
                      <p className="font-bold text-foreground">{month}</p>
                      <p className="text-xs text-muted-foreground">
                        {getBengaliNumber(index + 1)} নম্বর মাস
                      </p>
                      {hijriDate.month === index + 1 && (
                        <span className="inline-block mt-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                          চলমান
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="px-4 pb-10">
        <IslamicEducationalSection {...calendarContent} />
      </div>

      <BottomNavigation />
    </div>
  );
};

export default IslamicCalendarPage;
