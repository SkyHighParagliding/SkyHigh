import { useParams, Link } from "react-router-dom";
import { Calendar, User, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { MarkdownWithWidgets } from "@/components/ContentWidgets";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export function NewsDetail() {
  const { id } = useParams();

  const { data: item, isLoading, error } = useQuery({
    queryKey: ['news', id],
    queryFn: () => api.get<Record<string, any>>(`/api/news/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;
  if (error || !item) return <div className="min-h-screen flex items-center justify-center text-red-500 bg-background">{(error as Error)?.message || "News item not found"}</div>;

  return (
    <div className="bg-background min-h-screen pb-16">
      <div className={`${item.heroImage ? 'text-white' : 'bg-white text-slate-900'} py-16 relative overflow-hidden`}>
        {item.heroImage && (
          <>
            <div className="absolute inset-0">
              <img src={item.heroImage} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <div className="absolute inset-0 bg-navy/60" />
          </>
        )}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <Link to="/news" className={`inline-flex items-center ${item.heroImage ? 'text-sky-300 hover:text-white' : 'text-sky hover:text-sky-700'} mb-6 font-medium transition-colors`}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to News
          </Link>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className={`text-4xl md:text-5xl font-extrabold tracking-tight mb-6 ${item.heroImage ? '' : 'text-navy'}`}>{item.title}</h1>
            <div className={`flex flex-wrap items-center ${item.heroImage ? 'text-white/70' : 'text-slate-500'} space-x-6 text-sm md:text-base`}>
              <span className="flex items-center mb-2"><Calendar className="w-4 h-4 mr-2" /> {new Date(item.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="flex items-center mb-2"><User className="w-4 h-4 mr-2" /> {item.author}</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-2xl shadow-xl p-8 md:p-12 border border-border-faint"
        >
          <MarkdownWithWidgets content={item.content} />
        </motion.div>
      </div>
    </div>
  );
}
