import { ArrowLeft, Mail, Facebook, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import { ContactForm } from "@/components/ContactForm";

const ContactPage = () => {
  const navigate = useNavigate();
  const { legal, branding } = useGlobalConfig();

  const appName = branding.appName || "NOOR";
  const devName = legal.developerName || "ABEDIN MOLLA";
  const devNameBn = legal.developerNameBn || "আবিদিন মোল্লা";
  const country = legal.country || "India";
  const countryBn = legal.countryBn || "ভারত";
  const email = legal.contactEmail || "support@noorapp.in";
  const facebookUrl = legal.facebookUrl || "";
  const whatsappUrl = legal.whatsappUrl || "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-muted/70 border border-border/60 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-wide">Contact Us</h1>
            <p className="text-sm text-muted-foreground">যোগাযোগ করুন</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">
        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-3">
          <h2 className="text-lg font-semibold">Get in Touch / যোগাযোগ করুন</h2>
          <p className="text-muted-foreground">
            We value your feedback, questions, and suggestions. Whether you've found a bug,
            have a feature request, or want to report a content error, please don't hesitate
            to reach out. We typically respond within 24–48 hours.
          </p>
          <p className="text-muted-foreground font-bangla">
            আমরা আপনার মতামত, প্রশ্ন ও পরামর্শকে মূল্য দিই। কোনো বাগ পেলে, নতুন ফিচারের
            অনুরোধ থাকলে, বা কনটেন্টে ত্রুটি দেখলে অনুগ্রহ করে জানাতে দ্বিধা করবেন না।
            সাধারণত ২৪–৪৮ ঘণ্টার মধ্যে আমরা উত্তর দিয়ে থাকি।
          </p>
        </section>

        {/* Interactive Contact Form */}
        <ContactForm />

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-4">
          <h2 className="text-lg font-semibold">Other Contact Methods / অন্যান্য যোগাযোগের মাধ্যম</h2>
          <div className="space-y-3">
            <a
              href={`mailto:${encodeURIComponent(email)}`}
              className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/80 hover:bg-muted/50 transition-colors"
            >
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground text-xs">Email</p>
                <p className="text-muted-foreground text-xs">{email}</p>
              </div>
            </a>

            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/80 hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 rounded-lg bg-primary/10">
                  <Facebook className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-xs">Facebook</p>
                  <p className="text-muted-foreground text-xs">Visit our Facebook page</p>
                </div>
              </a>
            )}

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/80 hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 rounded-lg bg-primary/10">
                  <MessageCircle className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-xs">WhatsApp</p>
                  <p className="text-muted-foreground text-xs">Message us on WhatsApp</p>
                </div>
              </a>
            )}
          </div>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-3">
          <h2 className="text-lg font-semibold">Developer / ডেভেলপার</h2>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">{devName}</span><br />
            Independent Developer — {country}
          </p>
          <p className="text-muted-foreground font-bangla">
            <span className="font-semibold text-foreground">{devNameBn}</span><br />
            স্বাধীন ডেভেলপার — {countryBn}
          </p>
        </section>

        <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-3">
          <h2 className="text-lg font-semibold">Report Content Issues / কনটেন্ট সমস্যা জানান</h2>
          <p className="text-muted-foreground">
            If you notice any inaccuracy in Quran text, hadith references, prayer time
            calculations, or any other Islamic content, please report it immediately via
            email or the form above. We take content accuracy very seriously and will
            address the issue promptly.
          </p>
          <p className="text-muted-foreground font-bangla">
            কুরআনের টেক্সট, হাদিসের রেফারেন্স, নামাজের সময় গণনা বা অন্য কোনো ইসলামিক
            কনটেন্টে কোনো ভুল লক্ষ্য করলে অনুগ্রহ করে অবিলম্বে ইমেইলের মাধ্যমে বা ওপরের
            ফর্মের মাধ্যমে জানান। কনটেন্টের নির্ভুলতা আমরা অত্যন্ত গুরুত্বের সাথে দেখি এবং
            দ্রুত সমাধান করি।
          </p>
        </section>
      </main>
    </div>
  );
};

export default ContactPage;
