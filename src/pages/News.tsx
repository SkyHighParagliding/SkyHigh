import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, Calendar, User, ArrowLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useNews } from "@/hooks/api";

export function News() {
  const { data: news = [], isLoading } = useNews();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky"></div></div>;

  return (
    <div className="bg-background min-h-screen pb-16">
      {/* Hero Section */}
      <div className="bg-white text-slate-900 py-16 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <Link to="/" className="inline-flex items-center text-sky hover:text-sky-700 mb-6 font-medium transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-navy">Club News & Events</h1>
            <p className="text-lg text-slate-600 max-w-3xl">
              Stay up to date with the latest announcements, event reports, and club updates.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {news.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Link to={`/news/${item.id}`} className="group block h-full">
                <Card className="h-full hover:shadow-xl transition-all duration-300 border-t-4 border-t-emerald-500 hover:-translate-y-1">
                  <CardHeader>
                    <div className="flex items-center text-xs text-muted-foreground mb-2 space-x-4">
                      <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {new Date(item.date || item.publishedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>

                      <span className="flex items-center"><User className="w-3 h-3 mr-1" /> {item.author}</span>
                    </div>
                    <CardTitle className="text-xl text-navy group-hover:text-sky transition-colors line-clamp-2">
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground-secondary text-sm line-clamp-3 mb-6">
                      {item.content
                        .replace(/^:::(highlight|info|warning)\s*$/gm, '')
                        .replace(/^:::\s*$/gm, '')
                        .replace(/^->>(.+)<<-$/gm, '$1')
                        .replace(/^->(.+)<-$/gm, '$1')
                        .replace(/\^\^\^(.+?)\^\^\^/g, '$1')
                        .replace(/::([^:]+)::/g, '$1')
                        .replace(/\{\{[^}]+\}\}/g, '')
                        .replace(/[#*`]/g, '')
                        .replace(/!\[.*?\]\(.*?\)/g, '')
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                        .replace(/\n+/g, ' ')
                        .trim()
                        .substring(0, 150)}...
                    </p>
                    <div className="flex items-center text-sky font-semibold text-sm group-hover:translate-x-1 transition-transform">
                      Read More <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
          {news.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <Newspaper className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-navy mb-2">No news yet</h3>
              <p className="text-muted-foreground">Check back soon for updates!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
