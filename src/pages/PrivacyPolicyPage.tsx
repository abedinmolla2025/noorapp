import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalConfig } from "@/context/GlobalConfigContext";

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();
  const { legal, branding } = useGlobalConfig();

  const appName = branding.appName || "NOOR";
  const lastUpdated = legal.privacyPolicyLastUpdated || "2026-10-15";
  const version = legal.legalVersionNumber || "";
  const regionNote = legal.regionComplianceNote || "";

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
            <h1 className="text-xl font-bold tracking-wide">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">How {appName} handles your data</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Effective / last updated: {lastUpdated}</span>
          {version && <span>Version: {version}</span>}
        </div>

        <section className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-muted-foreground">
          This policy explains local storage, analytics, advertising cookies, third-party processors, location data handling, data retention, children’s privacy, and how to request deletion or contact us about privacy.
        </section>

        {regionNote && (
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-muted-foreground">
            {regionNote}
          </section>
        )}

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">1. Introduction / ভূমিকা</h2>
          <p className="text-muted-foreground">
            {appName} is designed to help you with prayer times, Quran, duas and
            other Islamic content. We only collect the minimum information needed to keep the
            app working smoothly and to improve your experience.
          </p>
          <p className="text-muted-foreground">
            {appName} আপনার নামাজের সময়সূচি, কুরআন, দোআ ও অন্যান্য ইসলামিক কনটেন্ট
            সহজভাবে পাওয়ার জন্য তৈরি করা হয়েছে। অ্যাপ সঠিকভাবে চালু রাখতে এবং আপনাকে ভালো
            অভিজ্ঞতা দিতে যতটুকু প্রয়োজন ততটুকু সীমিত তথ্যই শুধু ব্যবহার করা হয়।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">2. What we store on your device / আপনার ডিভাইসে যা সেভ হয়</h2>
          <p className="text-muted-foreground">
            Some preferences (such as theme mode, language selection, quiz progress,
            notification and prayer settings) are stored locally on your device using
            localStorage. This data never leaves your device unless your platform (for example,
            backup services) syncs it.
          </p>
          <p className="text-muted-foreground">
            থিম (ডার্ক/লাইট), ভাষা নির্বাচন, কুইজ প্রগ্রেস, নোটিফিকেশন পছন্দ, নামাজের সময় ইত্যাদি
            কিছু সেটিংস আপনার ডিভাইসে localStorage এর মাধ্যমে সেভ থাকে। এই তথ্য কেবলমাত্র
            আপনার ডিভাইসেই থাকে এবং অ্যাপের ভেতরে আপনার অভিজ্ঞতা ব্যক্তিগত করার জন্য ব্যবহৃত হয়।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">3. Usage information & analytics / ব্যবহারের তথ্য ও অ্যানালিটিক্স</h2>
          <p className="text-muted-foreground">
            The app may collect anonymous usage information (such as which screens are visited
            most) to understand how features are used. This information is aggregated and does
            not identify you personally.
          </p>
          <p className="text-muted-foreground">
            Analytics tool: <strong className="text-foreground">[name to be provided by the Noor App team]</strong>.
            Once configured, the tool's name and its data practices will be listed here.
          </p>
          <p className="text-muted-foreground">
            অ্যাপের কোন পেজ বেশি ব্যবহার হচ্ছে, কোন ফিচার বেশি দেখা হচ্ছে – এমন কিছু সামগ্রিক
            (anonymous) তথ্য বিশ্লেষণের জন্য ব্যবহার করা হতে পারে, যা কখনই কোনো ব্যবহারকারীকে
            আলাদা করে শনাক্ত করার জন্য ব্যবহৃত হয় না।
          </p>
          <p className="text-muted-foreground">
            অ্যানালিটিক্স টুল: <strong className="text-foreground">[নাম পরে জানানো হবে]</strong>।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">4. Your rights / আপনার অধিকার</h2>
          <p className="text-muted-foreground">
            You can clear app data (such as local preferences or quiz history) from your device
            at any time through your browser or device settings. If you stop using the app,
            we do not keep any additional personal information about you inside the app.
          </p>
          <p className="text-muted-foreground">
            আপনি চাইলে যেকোনো সময় ব্রাউজার বা ডিভাইসের সেটিংস থেকে অ্যাপের local data মুছে ফেলতে
            পারবেন। আপনি অ্যাপ ব্যবহার বন্ধ করে দিলে আমাদের পক্ষ থেকে আলাদা করে আপনার ব্যক্তিগত
            তথ্য সংরক্ষণ করা হয় না।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">5. Data retention / ডেটা সংরক্ষণকাল</h2>
          <p className="text-muted-foreground">
            Preferences stored on your device (theme, language, quiz progress, prayer settings)
            are kept until you clear them yourself — {appName} does not delete them on a schedule,
            and they never leave your device except through your own platform backups. Anonymous,
            aggregated usage statistics, if collected, are retained only for as long as needed to
            improve the app and are then deleted or further anonymized.
          </p>
          <p className="text-muted-foreground">
            আপনার ডিভাইসে সেভ থাকা পছন্দসমূহ (থিম, ভাষা, কুইজ প্রগ্রেস, নামাজের সেটিংস) আপনি নিজে
            না মুছা পর্যন্ত থেকে যায় — {appName} এগুলো নির্দিষ্ট সময় পর নিজে মুছে দেয় না। সামগ্রিক
            (anonymous) ব্যবহার-পরিসংখ্যান, যদি সংগ্রহ করা হয়, শুধু অ্যাপ উন্নত করার জন্য যতদিন
            প্রয়োজন ততদিন রাখা হয়, তারপর মুছে ফেলা হয়।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">6. Children’s privacy / শিশুদের গোপনীয়তা</h2>
          <p className="text-muted-foreground">
            {appName} is a general-audience religious app and does not knowingly collect personal
            information from children under 13. The app has no accounts, no sign-in, and no way for
            a child to submit personal information to us. If you believe a child has provided us
            with personal information, contact us through the <a href="/contact" className="text-primary hover:underline">Contact page</a> and
            we will delete it promptly.
          </p>
          <p className="text-muted-foreground">
            {appName} একটি সাধারণ ধর্মীয় অ্যাপ; ১৩ বছরের কম বয়সী শিশুদের কাছ থেকে আমরা জেনেশুনে
            কোনো ব্যক্তিগত তথ্য সংগ্রহ করি না। অ্যাপে কোনো অ্যাকাউন্ট বা সাইন-ইন নেই, তাই শিশুর
            পক্ষে আমাদের কাছে ব্যক্তিগত তথ্য পাঠানোর কোনো উপায় নেই। কোনো শিশু তথ্য দিয়ে থাকলে
            <a href="/contact" className="text-primary hover:underline">যোগাযোগ পাতার</a> মাধ্যমে জানান — আমরা তা দ্রুত মুছে দেবো।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">7. Deletion requests / ডেটা মুছে ফেলার অনুরোধ</h2>
          <p className="text-muted-foreground">
            Because {appName} keeps no accounts and stores your preferences only on your own
            device, there is usually nothing on our servers to delete. To remove everything:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
            <li>Clear the app's local data from your browser or device settings (this removes theme, language, quiz progress and prayer settings).</li>
            <li>For anything else — for example, if you contacted us and want that correspondence deleted — send a deletion request through the <a href="/contact" className="text-primary hover:underline">Contact page</a>. We respond to deletion requests within 30 days.</li>
          </ul>
          <p className="text-muted-foreground">
            {appName}-এ কোনো অ্যাকাউন্ট নেই এবং আপনার পছন্দ শুধু আপনার ডিভাইসে থাকে, তাই আমাদের
            সার্ভারে সাধারণত মুছার মতো কিছু থাকে না। সব মুছতে চাইলে:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
            <li>ব্রাউজার বা ডিভাইসের সেটিংস থেকে অ্যাপের local data মুছে ফেলুন।</li>
            <li>অন্য কিছুর জন্য (যেমন যোগাযোগের বার্তা মুছতে চাইলে) <a href="/contact" className="text-primary hover:underline">যোগাযোগ পাতার</a> মাধ্যমে ডিলিশন রিকোয়েস্ট পাঠান — ৩০ দিনের মধ্যে জবাব দেওয়া হয়।</li>
          </ul>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">8. Advertising & Cookies / বিজ্ঞাপন ও কুকিজ</h2>
          <p className="text-muted-foreground">
            {appName} may display advertisements provided by third-party advertising networks,
            including Google AdSense. These services may use cookies and similar tracking technologies
            to serve ads based on your prior visits to this app or other websites. Google's use of
            advertising cookies enables it and its partners to serve ads based on your visit to
            {appName} and/or other sites on the internet.
          </p>
          <p className="text-muted-foreground">
            Third-party vendors, including Google, use cookies (such as the DART cookie) to serve
            personalized ads to users based on their visits to this site and other sites on the
            internet. Personalized advertising may also be served by Google's certified partners
            listed at{" "}
            <a
              href="https://support.google.com/admanager/answer/9012903"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              Google's ad technology providers
            </a>
            . You can review Google's advertising principles at{" "}
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              policies.google.com/technologies/ads
            </a>
            .
          </p>
          <p className="text-muted-foreground">
            {appName} তৃতীয় পক্ষের বিজ্ঞাপন নেটওয়ার্ক (যেমন Google AdSense) এর মাধ্যমে বিজ্ঞাপন
            প্রদর্শন করতে পারে। এই পরিষেবাগুলো আপনার পূর্ববর্তী ভিজিটের উপর ভিত্তি করে বিজ্ঞাপন
            দেখানোর জন্য কুকিজ ও অনুরূপ ট্র্যাকিং প্রযুক্তি ব্যবহার করতে পারে।
          </p>
          <p className="text-muted-foreground">
            You can opt out of personalized advertising at any time by visiting{" "}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer" className="text-primary underline">
              Google Ads Settings
            </a>
            , the EU users' choices page{" "}
            <a href="https://www.youronlinechoices.eu/" target="_blank" rel="noreferrer" className="text-primary underline">
              youronlinechoices.eu
            </a>
            , or{" "}
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noreferrer" className="text-primary underline">
              www.aboutads.info
            </a>
            . You can also withdraw or change consent any time from the cookie banner in this app.
          </p>
          <p className="text-muted-foreground">
            আপনি{" "}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer" className="text-primary underline">
              Google Ads Settings
            </a>{" "}
            থেকে ব্যক্তিগতকৃত বিজ্ঞাপন বন্ধ করতে পারেন।
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">9. Third-party services / তৃতীয় পক্ষের সেবা</h2>
          <p className="text-muted-foreground">
            {appName} uses the following third-party services that may collect data:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
            <li><strong className="text-foreground">Aladhan API</strong> — for prayer time calculations. When you enable location-based prayer times, your <strong className="text-foreground">coordinates (latitude and longitude)</strong> are sent to the Aladhan API to compute the times.</li>
            <li><strong className="text-foreground">OpenStreetMap / Nominatim</strong> — for reverse geocoding. Your <strong className="text-foreground">coordinates</strong> are sent to Nominatim to display your city name. Coordinates are coarsened before sending and are not stored by {appName}.</li>
            <li><strong className="text-foreground">Google AdSense</strong> — for displaying relevant advertisements.</li>
            <li><strong className="text-foreground">Cloudflare</strong> — for content delivery, security and DDoS protection. Cloudflare may process your IP address and request metadata as traffic passes through its network.</li>
          </ul>
          <p className="text-muted-foreground">
            {appName} নিম্নলিখিত তৃতীয় পক্ষের সেবা ব্যবহার করে:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
            <li><strong className="text-foreground">Aladhan API</strong> — নামাজের সময় গণনার জন্য। লোকেশনভিত্তিক সময় চালু করলে আপনার <strong className="text-foreground">কোঅর্ডিনেট (অক্ষাংশ ও দ্রাঘিমাংশ)</strong> Aladhan API-তে পাঠানো হয়।</li>
            <li><strong className="text-foreground">OpenStreetMap / Nominatim</strong> — শহরের নাম দেখানোর জন্য আপনার <strong className="text-foreground">কোঅর্ডিনেট</strong> Nominatim-এ পাঠানো হয়। {appName} কোঅর্ডিনেট সংরক্ষণ করে না।</li>
            <li><strong className="text-foreground">Google AdSense</strong> — প্রাসঙ্গিক বিজ্ঞাপন প্রদর্শনের জন্য।</li>
            <li><strong className="text-foreground">Cloudflare</strong> — কনটেন্ট ডেলিভারি, নিরাপত্তা ও DDoS সুরক্ষার জন্য।</li>
          </ul>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-2">
          <h2 className="text-lg font-semibold">10. Changes & contact / নীতি পরিবর্তন ও যোগাযোগ</h2>
          <p className="text-muted-foreground">
            This privacy policy may be updated as the app evolves. If you have questions or
            concerns, you may reach out to the {appName} team through the <a href="/contact" className="text-primary hover:underline">Contact page</a>.
          </p>
          <p className="text-muted-foreground">
            ভবিষ্যতে অ্যাপের উন্নয়নের সাথে সাথে এই প্রাইভেসি নীতিমালায় পরিবর্তন আসতে পারে। কোনো
            প্রশ্ন বা উদ্বেগ থাকলে <a href="/contact" className="text-primary hover:underline">যোগাযোগ পাতার</a> মাধ্যমে
            ডেভেলপার টিমের সাথে যোগাযোগ করতে পারবেন।
          </p>
        </section>
      </main>
    </div>
  );
};

export default PrivacyPolicyPage;
