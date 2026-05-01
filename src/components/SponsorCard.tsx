import { ExternalLink } from "lucide-react";
import LazyMarkdown from "@/components/LazyMarkdown";

interface SponsorCardProps {
  name: string;
  logo?: string;
  url?: string;
  markdown?: string;
}

export function SponsorCard({ name, logo, url, markdown }: SponsorCardProps) {
  return (
    <div className="group relative bg-card rounded-2xl border border-amber-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50/40 via-transparent to-amber-100/20 pointer-events-none" />
      <div className="relative p-6 sm:p-8">
        <div className="flex items-start gap-5 mb-4">
          {logo && logo.trim() ? (
            <div className="shrink-0 w-20 h-20 rounded-xl bg-white border border-amber-100 shadow-sm flex items-center justify-center overflow-hidden group-hover:shadow-md transition-shadow">
              <img
                src={logo}
                alt={`${name} logo`}
                className="w-full h-full object-contain p-2"
              />
            </div>
          ) : (
            <div className="shrink-0 w-20 h-20 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-200 shadow-sm flex items-center justify-center group-hover:shadow-md transition-shadow">
              <span className="text-2xl font-extrabold text-amber-700/70">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-navy group-hover:text-amber-800 transition-colors">
              {name}
            </h3>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-sm text-amber-600 hover:text-amber-800 font-medium mt-1 transition-colors"
              >
                Visit website <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {markdown && (
          <div className="prose prose-sm max-w-none text-foreground-secondary prose-headings:text-navy prose-a:text-amber-600 hover:prose-a:text-amber-800 prose-strong:text-navy">
            <LazyMarkdown variant="raw">
              {markdown}
            </LazyMarkdown>
          </div>
        )}
      </div>
      <div className="h-1 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300 opacity-60 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
