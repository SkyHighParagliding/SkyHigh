import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Check, ChevronDown, ChevronUp, Users, Shield, Award, Heart, HelpCircle } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { motion } from "motion/react";

interface MembershipTier {
  name: string;
  price: string;
  description: string;
  features: string[];
}

const defaultTiers: MembershipTier[] = [
  {
    name: "Full Membership",
    price: "$120/year",
    description: "Full flying privileges at all club sites with voting rights.",
    features: ["Access to all flying sites", "Voting rights at AGM", "Club communications & updates", "Event participation"],
  },
  {
    name: "Student Membership",
    price: "$60/year",
    description: "Discounted rate for students currently enrolled in a paragliding or hang gliding course.",
    features: ["Access to training sites", "Mentorship program", "Club communications", "Event participation"],
  },
  {
    name: "Social Membership",
    price: "$30/year",
    description: "Stay connected with the club community without flying privileges.",
    features: ["Club communications & updates", "Social event access", "Newsletter", "Community access"],
  },
];

const defaultFaqs = [
  {
    q: "What do I get with my membership?",
    a: "Membership gives you access to our flying sites, safety briefings, community events, and club communications. Full members also get voting rights at the AGM.",
  },
  {
    q: "Do I need a SAFA/HGFA membership?",
    a: "Yes. All flying members must hold a current Sports Aviation Federation of Australia (SAFA) membership with appropriate ratings. This is separate from your club membership.",
  },
  {
    q: "How do I renew my membership?",
    a: "Memberships are renewed annually through TidyHQ. You'll receive a reminder email before your membership expires. Simply follow the link to renew and pay online.",
  },
  {
    q: "Can I try before I join?",
    a: "Visiting pilots are welcome at our sites. Check our Visiting Pilots page for day-use arrangements. We encourage you to come fly with us before committing to membership.",
  },
  {
    q: "How do I change my membership tier?",
    a: "Contact the committee to discuss changing your membership tier. Changes take effect at the next renewal period.",
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 px-1 text-left transition-colors hover:opacity-80"
      >
        <span className="text-[15px] font-medium pr-4" style={{ color: "#1d1d1f" }}>{question}</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-gray-400" /> : <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />}
      </button>
      {open && (
        <div className="pb-5 px-1">
          <p className="text-[14px] leading-relaxed" style={{ color: "#6e6e73" }}>{answer}</p>
        </div>
      )}
    </div>
  );
}

export function Join() {
  const { settings, loading } = useSettings();
  const navigate = useNavigate();
  const clubName = settings.clubName || "SkyHigh";

  useEffect(() => {
    if (!loading && !settings.joinPageEnabled) {
      navigate("/", { replace: true });
    }
  }, [settings.joinPageEnabled, loading, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#f5f5f7" }} />;
  }

  if (!settings.joinPageEnabled) {
    return null;
  }

  const signupUrl = (settings.joinTidyhqUrl as string) || "https://skyhigh.tidyhq.com/public/membership_levels";

  let tiers: MembershipTier[] = defaultTiers;
  try {
    const parsed = settings.joinTiers ? JSON.parse(settings.joinTiers as string) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      tiers = parsed;
    }
  } catch {}

  let faqs = defaultFaqs;
  try {
    const parsed = settings.joinFaqs ? JSON.parse(settings.joinFaqs as string) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      faqs = parsed;
    }
  } catch {}

  const heroTitle = (settings.joinHeroTitle as string) || `Join ${clubName}`;
  const heroSubtitle = (settings.joinHeroSubtitle as string) || "Become part of our flying community. Choose a membership tier that suits you and sign up through TidyHQ.";

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#f5f5f7" }}>
      <section
        data-hero
        className="relative flex flex-col items-center justify-center text-center -mt-[56px] sm:-mt-[76px] pt-[120px] sm:pt-[160px] pb-16 sm:pb-24 px-4"
        style={{
          background: "linear-gradient(135deg, #1d1d1f 0%, #2c3e50 40%, #007aff 100%)",
          minHeight: "480px",
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 30% 20%, rgba(0,122,255,0.3) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,122,255,0.15) 0%, transparent 50%)",
            }}
          />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-[12px] font-semibold tracking-widest uppercase text-blue-300 mb-4">Membership</span>
            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight mb-6"
              style={{ fontFamily: "var(--tmpl-font-heading)" }}
            >
              {heroTitle}
            </h1>
            <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed mb-8" style={{ fontFamily: "var(--tmpl-font-body)" }}>
              {heroSubtitle}
            </p>
            <a
              href={signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-white font-semibold text-[15px] transition-all hover:scale-105 hover:shadow-lg"
              style={{ background: "#007aff" }}
            >
              Sign Up Now <ExternalLink className="w-4 h-4" />
            </a>
          </motion.div>
        </div>
      </section>

      <section className="relative z-10 -mt-10 px-4 sm:px-6 pb-16">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20"
          >
            {[
              { icon: <Users className="w-6 h-6" />, title: "Community", desc: "Join a welcoming community of paragliding and hang gliding pilots." },
              { icon: <Shield className="w-6 h-6" />, title: "Safety", desc: "Access to safety briefings, trained safety officers, and incident support." },
              { icon: <Award className="w-6 h-6" />, title: "Flying Sites", desc: "Fly at maintained and managed club sites across the region." },
              { icon: <Heart className="w-6 h-6" />, title: "Events", desc: "Social fly-ins, competitions, workshops, and community gatherings." },
            ].map((benefit, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl text-center"
                style={{
                  background: "rgba(255,255,255,0.65)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
                  style={{ background: "rgba(0,122,255,0.1)", color: "#007aff" }}
                >
                  {benefit.icon}
                </div>
                <h3 className="text-[15px] font-semibold mb-2" style={{ color: "#1d1d1f" }}>{benefit.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "#6e6e73" }}>{benefit.desc}</p>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading)" }}>
                Membership Tiers
              </h2>
              <p className="text-[15px]" style={{ color: "#6e6e73" }}>Choose the membership that's right for you.</p>
            </div>

            <div className={`grid gap-6 mb-20 ${tiers.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : tiers.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {tiers.map((tier, i) => (
                <div
                  key={i}
                  className="relative p-8 rounded-2xl flex flex-col transition-shadow hover:shadow-xl"
                  style={{
                    background: i === 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.65)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    border: i === 0 ? "2px solid #007aff" : "1px solid rgba(255,255,255,0.3)",
                    boxShadow: i === 0 ? "0 8px 40px rgba(0,122,255,0.12)" : "0 4px 24px rgba(0,0,0,0.06)",
                  }}
                >
                  {i === 0 && (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold tracking-wider uppercase px-4 py-1 rounded-full text-white"
                      style={{ background: "#007aff" }}
                    >
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold mb-1" style={{ color: "#1d1d1f" }}>{tier.name}</h3>
                  <p className="text-2xl font-bold mb-3" style={{ color: "#007aff" }}>{tier.price}</p>
                  <p className="text-[14px] leading-relaxed mb-6" style={{ color: "#6e6e73" }}>{tier.description}</p>
                  <ul className="space-y-2.5 mb-8 flex-1">
                    {tier.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#34c759" }} />
                        <span className="text-[13px]" style={{ color: "#1d1d1f" }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-3 rounded-xl font-semibold text-[14px] transition-all hover:opacity-90"
                    style={{
                      background: i === 0 ? "#007aff" : "rgba(0,122,255,0.1)",
                      color: i === 0 ? "#ffffff" : "#007aff",
                    }}
                  >
                    Join Now
                  </a>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4" style={{ background: "rgba(0,122,255,0.1)", color: "#007aff" }}>
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading)" }}>
                Frequently Asked Questions
              </h2>
            </div>
            <div
              className="max-w-2xl mx-auto rounded-2xl p-6 sm:p-8 mb-16"
              style={{
                background: "rgba(255,255,255,0.65)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.3)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              }}
            >
              {faqs.map((faq, i) => (
                <FaqItem key={i} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="text-center pb-8"
          >
            <div
              className="max-w-2xl mx-auto rounded-2xl p-10 sm:p-12"
              style={{
                background: "linear-gradient(135deg, #1d1d1f 0%, #2c3e50 50%, #007aff 100%)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
              }}
            >
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4" style={{ fontFamily: "var(--tmpl-font-heading)" }}>
                Ready to fly with us?
              </h2>
              <p className="text-white/70 mb-6 text-[15px]">
                Join {clubName} today and become part of our flying community.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href={signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-white font-semibold text-[15px] transition-all hover:scale-105"
                  style={{ background: "#007aff" }}
                >
                  Sign Up Now <ExternalLink className="w-4 h-4" />
                </a>
                <Link
                  to="/page/new-pilots"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-semibold text-[15px] transition-all hover:scale-105"
                  style={{ background: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  New Pilots Info
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
