import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, MessageCircle, Phone, ShieldAlert, AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useSafetyOfficers, type SafetyOfficer } from "@/hooks/api";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { MarkdownWithWidgets } from "@/components/ContentWidgets";

interface SafetySection {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  sectionType: string;
  enabled: number;
  linkUrl: string | null;
  linkLabel: string | null;
}

function getDisplayName(person: { name: string; surname?: string; fullNameDisplay?: number }, allPeople: { name: string; surname?: string }[]): string {
  const firstName = person.name;
  const showFullName = person.fullNameDisplay !== 0;

  if (showFullName && person.surname) {
    return `${firstName} ${person.surname}`;
  }

  const dupes = allPeople.filter(p => p.name === firstName);
  if (dupes.length > 1 && person.surname) {
    return `${firstName} ${person.surname.charAt(0)}`;
  }
  return firstName;
}

function SafetyOfficerCard({ officer, displayName }: { officer: SafetyOfficer; displayName: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow border-t-4 border-t-sky">
      <CardContent className="pt-6 text-center flex flex-col items-center">
        {officer.photoUrl && (
          <img
            src={officer.photoUrl}
            alt={displayName}
            className="w-20 h-20 rounded-lg object-cover border-2 border-border mb-3"
          />
        )}
        <h3 className="font-bold text-lg text-navy">{displayName}</h3>
        <p className="text-sm text-sky font-medium mb-2">{officer.type === 'SSO' ? 'Senior Safety Officer' : 'Safety Officer'}</p>
        
        <div className="mt-4 pt-4 border-t border-border-faint min-h-[60px] flex flex-col justify-center">
          {!revealed ? (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setRevealed(true)}
              className="w-full"
            >
              Reveal Contact
            </Button>
          ) : (
            <div className="space-y-1">
              {officer.showTelegram ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <MessageCircle className="w-4 h-4 mr-2 text-foreground-faint" /> Use Telegram
                </p>
              ) : null}
              {officer.showPhone && officer.phone ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <Phone className="w-4 h-4 mr-2 text-foreground-faint" />
                  <a href={`tel:${officer.phone}`} className="underline">{officer.phone}</a>
                </p>
              ) : null}
              {officer.showEmail && officer.email ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <Mail className="w-4 h-4 mr-2 text-foreground-faint" />
                  <a href={`mailto:${officer.email}`} className="underline">{officer.email}</a>
                </p>
              ) : null}
              {officer.showAdminEmail ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <Mail className="w-4 h-4 mr-2 text-foreground-faint" />
                  <a href="mailto:web@skyhighparagliding.org.au" className="underline">Via Admin Email</a>
                </p>
              ) : null}
              {!officer.showTelegram && !(officer.showPhone && officer.phone) && !(officer.showEmail && officer.email) && !officer.showAdminEmail && (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <MessageCircle className="w-4 h-4 mr-2 text-foreground-faint" /> Contact on Telegram
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmergencySection({ section }: { section: SafetySection }) {
  return (
    <Card className="mb-16 border-l-8 border-l-red-500 shadow-lg bg-red-50/50">
      <CardHeader>
        <CardTitle className="flex items-center text-red-700 text-2xl">
          <AlertTriangle className="w-8 h-8 mr-3" /> {section.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm max-w-none text-foreground-label [&_strong]:text-navy [&_a]:text-red-600 [&_a:hover]:underline">
          <MarkdownWithWidgets content={section.content} />
        </div>
        {section.linkUrl && (
          <div className="mt-4">
            <Link to={section.linkUrl} className="text-red-600 font-semibold hover:underline text-sm flex items-center">
              {section.linkLabel || "Learn More"} <ExternalLink className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RulesSection({ section }: { section: SafetySection }) {
  return (
    <div className="mb-16">
      <h2 className="text-3xl font-bold text-navy mb-8 border-b pb-4">{section.title}</h2>
      <div className="bg-card p-8 rounded-xl shadow-sm border text-foreground-label prose prose-sm max-w-none [&_strong]:text-navy">
        <MarkdownWithWidgets content={section.content} />
      </div>
      {section.linkUrl && (
        <div className="mt-4">
          <Link to={section.linkUrl} className="text-sky font-semibold hover:underline text-sm flex items-center">
            {section.linkLabel || "Learn More"} <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>
      )}
    </div>
  );
}

function CustomSection({ section }: { section: SafetySection }) {
  return (
    <div className="mb-16">
      <h2 className="text-3xl font-bold text-navy mb-8 border-b pb-4">{section.title}</h2>
      <div className="bg-card p-8 rounded-xl shadow-sm border text-foreground-label prose prose-sm max-w-none [&_strong]:text-navy [&_a]:text-sky [&_a:hover]:underline">
        <MarkdownWithWidgets content={section.content} />
      </div>
      {section.linkUrl && (
        <div className="mt-4">
          <Link to={section.linkUrl} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky text-white font-medium hover:bg-sky-light transition-colors text-sm">
            {section.linkLabel || "Learn More"} <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

export function Safety() {
  const { settings } = useSettings();
  const { hash } = useLocation();
  const { data: officers = [], isLoading: loadingOfficers, error: officersError } = useSafetyOfficers();
  const { data: sections = [], isLoading: loadingSections, error: sectionsError } = useQuery({
    queryKey: ['safety-sections'],
    queryFn: () => api.get<SafetySection[]>('/api/safety-sections'),
  });

  const loading = loadingOfficers || loadingSections;

  useEffect(() => {
    if (!loading && hash) {
      const element = document.getElementById(hash.substring(1));
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [loading, hash]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky"></div></div>;
  const error = officersError || sectionsError;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-500">Error: {(error as Error).message}</div>;

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center text-sky hover:text-sky-light mb-6 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>
        
        <div className="text-center mb-16">
          <ShieldAlert className="w-16 h-16 text-orange mx-auto mb-6" />
          <h1 className="text-4xl md:text-5xl font-extrabold text-navy mb-4 tracking-tight">Safety & Rules</h1>
          <p className="text-xl text-foreground-secondary max-w-3xl mx-auto font-light">
            Safety is our highest priority. Familiarize yourself with our club rules, emergency procedures, and contact our Safety Officers if you have any concerns.
          </p>
        </div>

        {sections.map(section => {
          if (section.sectionType === "emergency") {
            return <EmergencySection key={section.id} section={section} />;
          }
          if (section.sectionType === "rules") {
            return <RulesSection key={section.id} section={section} />;
          }
          return <CustomSection key={section.id} section={section} />;
        })}

        <div className="mb-16">
          <h2 id="safety-officer-directory" className="text-3xl font-bold text-navy mb-8 border-b pb-4">Safety Officer Directory</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {officers.map((officer) => (
              <SafetyOfficerCard key={officer.id} officer={officer} displayName={getDisplayName(officer, officers)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
