import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalConfig } from "@/context/GlobalConfigContext";

const TermsPage = () => {
  const navigate = useNavigate();
  const { legal, branding } = useGlobalConfig();

  const appName = branding.appName || "NOOR";
  const devName = legal.developerName || "ABEDIN MOLLA";
  const devNameBn = legal.developerNameBn || "আবিদিন মোল্লা";
  const country = legal.country || "India";
  const countryBn = legal.countryBn || "ভারত";
  const lastUpdated = legal.termsLastUpdated || "2026-08-09";
  const version = legal.legalVersionNumber || "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-muted/70 border border-border/60 transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-wide">Terms &amp; Conditions</h1>
            <p className="text-sm text-muted-foreground">Guidelines for using {appName}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Effective / last updated: {lastUpdated}</span>
          {version && <span>Version: {version}</span>}
        </div>

        <section className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-muted-foreground">
          These terms describe acceptable use, service availability limits, content disclaimers, intellectual-property expectations, updates, and how to contact the developer about a dispute or correction.
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Developer</p>
          <p className="font-semibold">{devName} – {country}</p>
          <p className="text-muted-foreground">
            A humble effort by developer <span className="font-semibold">{devName}</span> from {country}{' '}
            to bring daily Islamic reminders—prayer times, Quran and duas—together in one beautiful place.
          </p>
          <p className="text-muted-foreground">
            {countryBn}-এর ডেভেলপার <span className="font-semibold">{devNameBn} ({devName})</span>-এর একটি ছোট
            প্রচেষ্টা, যেন নামাজের সময়, কুরআন ও দো'আর মত দৈনন্দিন ইসলামি আমলগুলো এক জায়গায় সুন্দরভাবে পাওয়া যায়।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary text-base font-semibold">{appName}</div>
          <div>
            <p className="font-semibold">About {appName}</p>
            <p className="text-muted-foreground">
              Developed by <span className="font-semibold">{devName}</span> ({country}) to make daily
              Islamic practice—prayer, Quran and duas—beautiful, simple and always close at hand.
            </p>
          </div>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">1. Purpose of the app / অ্যাপের উদ্দেশ্য</h2>
          <p className="text-muted-foreground">
            {appName} is provided for educational and spiritual benefit only. It should
            not be used for any harmful, offensive or unlawful activity.
          </p>
          <p className="text-muted-foreground">
            {appName} কেবল ইলমী ও আত্মিক উপকারের জন্য তৈরি। এটি কোনো প্রকার ক্ষতিকর,
            অশালীন বা আইনবিরোধী কাজে ব্যবহার করা সম্পূর্ণভাবে নিষিদ্ধ।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">2. Personal responsibility / ব্যক্তিগত দায়িত্ব</h2>
          <p className="text-muted-foreground">
            You remain responsible for verifying important information such as prayer times or
            religious rulings with trusted local scholars or sources. The app is a helpful tool,
            not a replacement for qualified scholarship.
          </p>
          <p className="text-muted-foreground">
            নামাজের সঠিক সময়, শরঈ মাসআলা বা গুরুত্বপূর্ণ কোনো বিষয়ের ক্ষেত্রে সর্বদা নির্ভরযোগ্য
            আলিম বা স্থানীয় ইসলামিক কর্তৃপক্ষের সাথে মিলিয়ে নেওয়া আপনার নিজস্ব দায়িত্ব। এই
            অ্যাপ কেবল সহায়ক মাধ্যম, আলিমদের বিকল্প নয়।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">3. Acceptable use / ব্যবহারবিধি</h2>
          <p className="text-muted-foreground">
            You agree not to misuse the app, attempt to break security, or disturb other users'
            experience in any way. Any abusive or harmful use is strictly prohibited.
          </p>
          <p className="text-muted-foreground">
            আপনি সম্মত হচ্ছেন যে, অ্যাপটি অপব্যবহার করবেন না, নিরাপত্তা ভঙ্গের চেষ্টা করবেন না,
            এবং অন্য ব্যবহারকারীর অভিজ্ঞতা নষ্ট হয় এমন কোনো কাজ করবেন না। এসব কাজ সম্পূর্ণভাবে নিষিদ্ধ।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">4. Developer information / ডেভেলপার তথ্য</h2>
          <p className="text-muted-foreground">
            This app has been developed and maintained by <span className="font-semibold">{devName}</span>
            {' '}from {country}, with the intention of serving the Muslim community with a clean and
            focused Islamic experience.
          </p>
          <p className="text-muted-foreground">
            এই অ্যাপটি {countryBn}-এর <span className="font-semibold">{devNameBn} ({devName})</span> কর্তৃক
            ডেভেলপ ও পরিচালিত, যেন মুসলিম উম্মাহ একটি সুন্দর, মনোযোগী ইসলামিক অ্যাপ ব্যবহার করতে পারে।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">5. Changes to these terms / শর্তাবলি পরিবর্তন</h2>
          <p className="text-muted-foreground">
            These terms may be updated over time as the app improves. Continued use of the app
            after changes means you accept the updated terms.
          </p>
          <p className="text-muted-foreground">
            ভবিষ্যতে অ্যাপের ফিচার ও সুবিধা বাড়ার সাথে সাথে এই শর্তাবলিতেও পরিবর্তন আসতে পারে। নতুন
            শর্ত প্রয়োগের পরও আপনি অ্যাপ ব্যবহার চালিয়ে গেলে ধরে নেওয়া হবে যে আপনি আপডেটেড
            শর্তাবলি মেনে নিয়েছেন।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">6. Contact / যোগাযোগ</h2>
          <p className="text-muted-foreground">
            For questions, disputes or corrections regarding these terms, please contact the
            developer through the <a href="/contact" className="text-primary hover:underline">Contact page</a>.
          </p>
          <p className="text-muted-foreground">
            এই শর্তাবলি সম্পর্কে কোনো প্রশ্ন, আপত্তি বা সংশোধনের জন্য <a href="/contact" className="text-primary hover:underline">যোগাযোগ পাতার</a> মাধ্যমে
            ডেভেলপারের সাথে যোগাযোগ করুন।
          </p>
        </section>
      </main>
    </div>
  );
};

export default TermsPage;
