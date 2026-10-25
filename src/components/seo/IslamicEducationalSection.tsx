import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

export interface EduSection {
  heading: string;
  paragraphs: string[];
  list?: string[];
}

export interface EduFaq {
  q: string;
  a: string;
}

export interface EduRelatedLink {
  label: string;
  to: string;
}

export interface EduSource {
  label: string;
  detail?: string;
}

export interface IslamicEducationalSectionProps {
  /** Visible H2 for the whole educational block */
  title: string;
  /** 1-2 short opening paragraphs */
  intro: string[];
  /** Body sections (h3 + paragraphs / list) */
  sections: EduSection[];
  faqs: EduFaq[];
  sources?: EduSource[];
  related?: EduRelatedLink[];
  /** Optional tone override for placement on dark hero pages */
  variant?: "light" | "dark";
}

/**
 * Reusable authentic-Islamic educational section for utility pages.
 * Adds visible SEO copy + JSON-LD FAQPage schema.
 * No UI redesign — plain semantic HTML that inherits page background.
 */
export default function IslamicEducationalSection({
  title,
  intro,
  sections,
  faqs,
  sources,
  related,
  variant = "light",
}: IslamicEducationalSectionProps) {
  const isDark = variant === "dark";
  const wrapper = isDark
    ? "bg-white/5 text-white/90"
    : "bg-card text-foreground";
  const heading = isDark ? "text-white" : "text-foreground";
  const muted = isDark ? "text-white/70" : "text-muted-foreground";
  const linkCls = isDark
    ? "text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
    : "text-primary hover:underline underline-offset-2";

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section
      className={`mt-8 rounded-2xl px-5 py-6 leading-relaxed ${wrapper}`}
      aria-label={title}
    >
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqLd)}</script>
      </Helmet>

      <h2 className={`text-xl md:text-2xl font-bold mb-3 ${heading}`}>{title}</h2>

      {intro.map((p, i) => (
        <p key={`intro-${i}`} className={`text-[15px] mb-3 ${muted}`}>
          {p}
        </p>
      ))}

      {sections.map((s, i) => (
        <div key={`sec-${i}`} className="mt-5">
          <h3 className={`text-lg font-semibold mb-2 ${heading}`}>{s.heading}</h3>
          {s.paragraphs.map((p, j) => (
            <p key={j} className={`text-[15px] mb-2 ${muted}`}>
              {p}
            </p>
          ))}
          {s.list && (
            <ul className={`list-disc list-inside space-y-1 text-[15px] ${muted}`}>
              {s.list.map((li, k) => (
                <li key={k}>{li}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="mt-6">
        <h3 className={`text-lg font-semibold mb-3 ${heading}`}>
          Frequently Asked Questions
        </h3>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details
              key={i}
              className={`rounded-lg border ${
                isDark ? "border-white/10 bg-white/5" : "border-border bg-background/60"
              } px-4 py-3`}
            >
              <summary
                className={`cursor-pointer font-medium ${heading} text-[15px]`}
              >
                {f.q}
              </summary>
              <p className={`mt-2 text-[14px] ${muted}`}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      {sources && sources.length > 0 && (
        <div className="mt-6">
          <h3 className={`text-lg font-semibold mb-2 ${heading}`}>
            Sources
          </h3>
          <ul className={`list-disc list-inside space-y-1 text-[14px] ${muted}`}>
            {sources.map((s, i) => (
              <li key={i}>
                <span className={heading + " font-medium"}>{s.label}</span>
                {s.detail ? ` — ${s.detail}` : null}
              </li>
            ))}
          </ul>
          <p className={`mt-2 text-[13px] ${muted}`}>
            See our{" "}
            <Link to="/sources" className={linkCls}>
              Islamic Sources
            </Link>{" "}
            page for full references and methodology.
          </p>
        </div>
      )}

      {related && related.length > 0 && (
        <div className="mt-6">
          <h3 className={`text-lg font-semibold mb-2 ${heading}`}>Related</h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
            {related.map((r, i) => (
              <li key={i}>
                <Link to={r.to} className={linkCls}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}