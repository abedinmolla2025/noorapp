import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Star, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BottomNavigation from "@/components/BottomNavigation";
import {
  getBengaliNumber,
  getCalendarPageEvents,
  gregorianToHijri,
  HIJRI_MONTHS_BN,
} from "@/lib/islamicCalendar";

// Hijri month names in Bengali + the governed event catalog live in the
// Islamic Calendar Engine (src/lib/islamicCalendar). The page renders them;
// it no longer defines its own conversion or event list.
// NOTE (Phase 4): Laylatul Qadr is a WINDOW (Ramadan 21-30) in the catalog,
// not a fixed 27th — the exact night is not fixed. Its badge therefore
// reads "২১–৩০ রমজান"; every other row renders exactly as before.
const hijriMonths = HIJRI_MONTHS_BN;
const importantDates = getCalendarPageEvents();

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
                          <h3 className="font-bold text-foreground">{date.nameBn}</h3>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                            {date.dayLabel}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{date.nameEn}</p>
                        <p className="text-sm text-foreground/80">{date.descriptionBn}</p>
                        {date.noteBn && (
                          <p className="text-xs text-muted-foreground italic">{date.noteBn}</p>
                        )}
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

      <BottomNavigation />
    </div>
  );
};

export default IslamicCalendarPage;
