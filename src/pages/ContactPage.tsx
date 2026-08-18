import { ArrowLeft, Facebook, Headphones, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import { ContactForm } from "@/components/ContactForm";

const ContactPage = () => {
  const navigate = useNavigate();
  const { legal, branding } = useGlobalConfig();

  const appName = branding.appName || "NOOR";
  const devName = legal.developerName || "ABEDIN MOLLA";
  const country = legal.country || "India";
  const email = legal.contactEmail || "support@noorapp.in";
  const facebookUrl = legal.facebookUrl || "";
  const whatsappUrl = legal.whatsappUrl || "";

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-slate-900 [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
      <header className="sticky top-3 z-40 mx-3 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:mx-auto sm:max-w-2xl">
        <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#15803D] transition-all duration-200 hover:bg-[#16A34A]/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16A34A]/10"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6 transition-transform group-hover:-translate-x-0.5" />
            </button>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-950">Support &amp; Feedback</h1>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#16A34A]/10 text-[#15803D]" aria-hidden="true">
            <Headphones className="h-5 w-5" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-9">
          <div className="flex items-center gap-5 sm:gap-7">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#16A34A]/10 text-[#15803D] ring-8 ring-[#16A34A]/5 sm:h-28 sm:w-28">
              <Headphones className="h-11 w-11 sm:h-12 sm:w-12" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">We're here to help! <span aria-hidden="true">👋</span></h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                Report a bug, request a feature, or share your feedback. Our team will get back to you as soon as possible.
              </p>
            </div>
          </div>
        </section>

        <ContactForm />

        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Alternative channels</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Other Contact Methods</h2>
            </div>
            <ShieldCheck className="mt-1 h-5 w-5 text-[#16A34A]" />
          </div>
          <div className="space-y-3">
            <a
              href={`mailto:${encodeURIComponent(email)}`}
              className="group flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#16A34A]/35 hover:shadow-[0_8px_20px_rgba(22,163,74,0.08)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#16A34A]/10 text-[#15803D]">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">Email</p>
                <p className="truncate text-xs text-slate-500">{email}</p>
              </div>
            </a>

            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#16A34A]/35 hover:shadow-[0_8px_20px_rgba(22,163,74,0.08)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#16A34A]/10 text-[#15803D]">
                  <Facebook className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Facebook</p>
                  <p className="text-xs text-slate-500">Visit our Facebook page</p>
                </div>
              </a>
            )}

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#16A34A]/35 hover:shadow-[0_8px_20px_rgba(22,163,74,0.08)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#16A34A]/10 text-[#15803D]">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">WhatsApp</p>
                  <p className="text-xs text-slate-500">Message us on WhatsApp</p>
                </div>
              </a>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">About the team</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Developer</h2>
          <div className="mt-5 rounded-xl border border-slate-100 bg-[#F8FAFC] p-4">
            <p className="text-sm font-bold text-slate-800">{devName}</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">Independent Developer — {country}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Accuracy matters</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Report Content Issues</h2>
          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-500">
            <p>
              If you notice any inaccuracy in Quran text, hadith references, prayer time calculations, or any other Islamic content, please report it immediately via email or the form above. We take content accuracy seriously and will address the issue promptly.
            </p>
          </div>
        </section>

        <p className="pb-2 text-center text-xs text-slate-400">{appName} Support Team</p>
      </main>
    </div>
  );
};

export default ContactPage;
