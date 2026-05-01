import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { MarkdownWithWidgets } from "@/components/ContentWidgets";
import { useSettings } from "@/contexts/SettingsContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

function resolveTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] || `{{${key}}}`);
}

export function Page() {
  const { slug } = useParams();
  const { settings } = useSettings();

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['pages', slug],
    queryFn: () => api.get<Record<string, any>>(`/api/pages/${slug}`),
    enabled: !!slug,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;
  if (error || !page) return <div className="min-h-screen flex items-center justify-center text-red-500 bg-background">{(error as Error)?.message || "Page not found"}</div>;

  return (
    <div className="bg-background min-h-screen pb-16">
      <div className={`${page.heroImage ? 'text-white' : 'bg-white text-slate-900'} py-16 relative overflow-hidden`}>
        {page.heroImage && (
          <>
            <div className="absolute inset-0">
              <img src={page.heroImage} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <div className="absolute inset-0 bg-navy/60" />
          </>
        )}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <Link to="/" className={`inline-flex items-center ${page.heroImage ? 'text-sky-300 hover:text-white' : 'text-sky hover:text-sky-700'} mb-6 font-medium transition-colors`}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Link>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={`text-4xl md:text-5xl font-extrabold tracking-tight ${page.heroImage ? '' : 'text-navy'}`}
          >
            {page.title}
          </motion.h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-2xl shadow-xl p-8 md:p-12 border border-border-faint"
        >
          <MarkdownWithWidgets content={resolveTokens(page.content, { clubName: settings.clubName || 'SkyHigh' })} />
        </motion.div>

        {slug === "new-pilots" && settings.joinPageEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 rounded-2xl p-8 text-center"
            style={{
              background: "linear-gradient(135deg, #1d1d1f 0%, #2c3e50 50%, #007aff 100%)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
            }}
          >
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2" style={{ fontFamily: "var(--tmpl-font-heading)" }}>
              Ready to join {settings.clubName || 'the club'}?
            </h3>
            <p className="text-white/70 mb-5 text-[14px]">
              Check out our membership options and sign up today.
            </p>
            <Link
              to="/join"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-white font-semibold text-[14px] transition-all hover:scale-105"
              style={{ background: "#007aff" }}
            >
              Join the Club <ExternalLink className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
