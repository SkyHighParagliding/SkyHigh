import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useSafetyOfficers, useSites } from "@/hooks/api";
import { useSettings } from "@/contexts/SettingsContext";
import { GraduationCap, Mail, MessageCircle, Phone, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LazyMarkdown from "@/components/LazyMarkdown";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

function SchoolsWidget({ shuffle = true }: { shuffle?: boolean }) {
  const { settings } = useSettings();
  let schools: { name: string; url: string }[] = [];
  try {
    schools = settings.homeSchools ? JSON.parse(settings.homeSchools) : [];
  } catch (e) {}

  if (schools.length === 0) return null;

  const displayed = shuffle ? [...schools].sort(() => 0.5 - Math.random()) : schools;

  return (
    <div className="my-6 p-5 bg-purple-50/50 border border-purple-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-bold text-purple-800">Paragliding Schools</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {displayed.map((school) => (
          <a
            key={school.name}
            href={school.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-semibold hover:bg-purple-100 hover:text-purple-800 transition-colors border border-purple-200"
          >
            {school.name}
          </a>
        ))}
      </div>
    </div>
  );
}

function TelegramWidget() {
  const { settings } = useSettings();
  let groups: { name: string; url: string }[] = [];
  try {
    groups = settings.homeTelegramGroups ? JSON.parse(settings.homeTelegramGroups) : [];
  } catch (e) {}

  if (groups.length === 0) return null;

  return (
    <div className="my-6 p-5 bg-sky-50/50 border border-sky-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-5 h-5 text-sky" />
        <h3 className="text-lg font-bold text-navy">Telegram Groups</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <a
            key={group.name}
            href={group.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-3 py-1.5 bg-navy/5 text-navy rounded-full text-sm font-semibold hover:bg-navy/10 transition-colors border border-navy/20"
          >
            {group.name}
          </a>
        ))}
      </div>
    </div>
  );
}

function CustomTagWidget({ tagName }: { tagName: string }) {
  const { settings } = useSettings();
  let allGroups: { name: string; url: string }[] = [];
  let allSchools: { name: string; url: string }[] = [];
  let customTags: { name: string; source?: string; items?: string[]; groupNames?: string[] }[] = [];
  try {
    allGroups = settings.homeTelegramGroups ? JSON.parse(settings.homeTelegramGroups) : [];
  } catch (e) {}
  try {
    allSchools = settings.homeSchools ? JSON.parse(settings.homeSchools) : [];
  } catch (e) {}
  try {
    customTags = settings.customWidgetTags && typeof settings.customWidgetTags === 'string' ? JSON.parse(settings.customWidgetTags) : [];
  } catch (e) {}

  const tag = customTags.find(t => t.name === tagName);
  if (!tag) return null;

  const source = tag.source || "telegram";
  const itemNames = tag.items || tag.groupNames || [];
  const sourceList = source === "schools" ? allSchools : allGroups;
  const filtered = sourceList.filter(g => itemNames.includes(g.name));
  if (filtered.length === 0) return null;

  if (source === "schools") {
    return (
      <div className="my-6 p-5 bg-purple-50/50 border border-purple-200 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-bold text-purple-800">Paragliding Schools</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {filtered.map((school) => (
            <a
              key={school.name}
              href={school.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm font-semibold hover:bg-purple-100 hover:text-purple-800 transition-colors border border-purple-200"
            >
              {school.name}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="my-6 p-5 bg-sky-50/50 border border-sky-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-5 h-5 text-sky" />
        <h3 className="text-lg font-bold text-navy">Telegram Groups</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {filtered.map((group) => (
          <a
            key={group.name}
            href={group.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-3 py-1.5 bg-navy/5 text-navy rounded-full text-sm font-semibold hover:bg-navy/10 transition-colors border border-navy/20"
          >
            {group.name}
          </a>
        ))}
      </div>
    </div>
  );
}

interface CommitteeMember {
  id: string;
  name: string;
  surname: string;
  organisation: string;
  phone: string;
  email: string;
  position?: string;
  safetyOfficerType?: string | null;
  isSafetyCommittee?: number;
  fullNameDisplay?: number;
  showTelegram?: number;
  showPhone?: number;
  showEmail?: number;
  showAdminEmail?: number;
  photoUrl?: string;
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

function extractRole(member: CommitteeMember): string {
  const positionRoles = ["President", "Vice President", "Treasurer", "Secretary", "PG2 Representative", "PG2 Rep"];
  const abbreviations = ["VP", "VP.", "SO.", "S.O.", "SSO", "SSO."];

  // Extract position role (first choice)
  let displayRole = "";
  if (member.position) {
    const parts = member.position.split(",").map(p => p.trim());
    const foundRole = parts.find(p => {
      const lower = p.toLowerCase();
      // Skip abbreviations and common keywords
      if (abbreviations.some(abbr => abbr.toLowerCase() === lower)) return false;
      return positionRoles.some(role => lower.includes(role.toLowerCase())) &&
             !lower.includes("committee") && !lower.includes("skyhigh");
    });
    if (foundRole) displayRole = foundRole;
  }

  // All cards on this page are committee members — default to "Committee" if no named position
  if (!displayRole) {
    displayRole = "Committee";
  }

  // Append SO/SSO inline after the position/committee label
  if (member.safetyOfficerType) {
    const soLabel = member.safetyOfficerType === "SSO" ? "SSO" : "SO";
    displayRole += " · " + soLabel;
  }

  return displayRole;
}

function getSortOrder(member: CommitteeMember): number {
  const role = extractRole(member).split(" · ")[0].toLowerCase() || "";
  const roleMap: Record<string, number> = {
    "president": 0,
    "vice president": 1,
    "treasurer": 2,
    "secretary": 3,
    "pg2 representative": 4,
    "pg2 rep": 4,
  };
  return roleMap[role] ?? 999;
}

function sortCommitteeMembers(members: CommitteeMember[]): CommitteeMember[] {
  return [...members].sort((a, b) => {
    const orderA = getSortOrder(a);
    const orderB = getSortOrder(b);
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function CommitteeMemberCard({ member, displayName }: { member: CommitteeMember; displayName: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow border-t-4 border-t-sky">
      <CardContent className="pt-6 text-center flex flex-col items-center">
        {member.photoUrl && (
          <img
            src={member.photoUrl}
            alt={displayName}
            className="w-20 h-20 rounded-lg object-cover border-2 border-border mb-3"
          />
        )}
        <h3 className="font-bold text-lg text-navy">{displayName}</h3>
        <p className="text-sm text-sky font-medium">{extractRole(member)}</p>
        {member.organisation && (
          <p className="text-sm text-sky font-medium mb-2">{member.organisation}</p>
        )}

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
              {member.showTelegram ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <MessageCircle className="w-4 h-4 mr-2 text-foreground-faint" /> Use Telegram
                </p>
              ) : null}
              {member.showPhone && member.phone ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <Phone className="w-4 h-4 mr-2 text-foreground-faint" />
                  <a href={`tel:${member.phone}`} className="underline">{member.phone}</a>
                </p>
              ) : null}
              {member.showEmail && member.email ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <Mail className="w-4 h-4 mr-2 text-foreground-faint" />
                  <a href={`mailto:${member.email}`} className="underline">{member.email}</a>
                </p>
              ) : null}
              {member.showAdminEmail ? (
                <p className="flex items-center justify-center text-sm text-foreground-secondary">
                  <Mail className="w-4 h-4 mr-2 text-foreground-faint" />
                  <a href="mailto:web@skyhighparagliding.org.au" className="underline">Via Admin Email</a>
                </p>
              ) : null}
              {!member.showTelegram && !(member.showPhone && member.phone) && !(member.showEmail && member.email) && !member.showAdminEmail && (
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

function CommitteeWidget({ compact }: { compact?: boolean }) {
  const { data: members = [], isLoading: loading } = useQuery({
    queryKey: ['contacts', 'public', 'committee'],
    queryFn: () => api.get<CommitteeMember[]>('/api/contacts/public/committee'),
    staleTime: 5 * 60 * 1000,
  });

  if (compact) {
    if (loading) return <div className="my-2 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div></div>;
    if (members.length === 0) return null;
    const sortedMembers = sortCommitteeMembers(members);
    return (
      <div className="flex flex-col items-center gap-1.5 mt-2">
        {sortedMembers.map(member => {
          const displayName = getDisplayName(member, members);
          return (
            <span
              key={member.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky/10 text-white rounded-full text-xs font-medium border border-sky/20"
            >
              {displayName}
              <span className="text-white/70 font-normal">· {extractRole(member)}</span>
              {member.organisation && (
                <span className="text-white/70 font-normal">· {member.organisation}</span>
              )}
            </span>
          );
        })}
      </div>
    );
  }

  if (loading) return <div className="my-6 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky"></div></div>;
  if (members.length === 0) return null;

  const sortedMembers = sortCommitteeMembers(members);

  return (
    <div id="committee-members" className="my-8">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-6 h-6 text-sky" />
        <h3 className="text-2xl font-bold text-navy">Committee Members</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {sortedMembers.map(member => (
          <CommitteeMemberCard key={member.id} member={member} displayName={getDisplayName(member, members)} />
        ))}
      </div>
    </div>
  );
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function processStyleSyntax(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inCallout: string | null = null;
  let calloutLines: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    if (trimmed.match(/^:::(highlight|info|warning)$/i)) {
      if (inCallout) {
        result.push(buildCallout(inCallout, calloutLines));
        calloutLines = [];
      }
      inCallout = trimmed.slice(3).toLowerCase();
      continue;
    }
    if (trimmed === ":::" && inCallout) {
      result.push(buildCallout(inCallout, calloutLines));
      calloutLines = [];
      inCallout = null;
      continue;
    }
    if (inCallout) {
      calloutLines.push(line);
      continue;
    }

    if (trimmed.match(/^::caption\s+.+::$/)) {
      const captionText = escapeHtml(trimmed.slice(10, -2).trim());
      result.push(`<div style="text-align:center;font-size:0.85rem;color:var(--color-caption);margin-top:-0.5rem;margin-bottom:1.5rem">${captionText}</div>`);
      continue;
    }

    if (trimmed.match(/^::[^:]+::$/) && !trimmed.startsWith(":::")) {
      const captionText = escapeHtml(trimmed.slice(2, -2).trim());
      result.push(`<div style="text-align:center;font-size:0.85rem;color:var(--color-caption);margin-top:-0.5rem;margin-bottom:1.5rem">${captionText}</div>`);
      continue;
    }

    if (trimmed.match(/^->>(.+)<<-$/)) {
      const inner = trimmed.slice(3, -3).trim();
      result.push(`<div style="text-align:right">\n\n${inner}\n\n</div>`);
      continue;
    }

    if (trimmed.match(/^->(.+)<-$/)) {
      const inner = trimmed.slice(2, -2).trim();
      result.push(`<div style="text-align:center">\n\n${inner}\n\n</div>`);
      continue;
    }

    if (trimmed.match(/^\^\^\^(.+)\^\^\^$/)) {
      const inner = trimmed.slice(3, -3).trim();
      result.push(`<span style="font-size:1.35rem;line-height:1.6">\n\n${inner}\n\n</span>`);
      continue;
    }

    result.push(line);
  }

  if (inCallout) {
    result.push(buildCallout(inCallout, calloutLines));
  }

  return result.join("\n");
}

function processCalloutLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.match(/^->>(.+)<<-$/)) {
    const inner = trimmed.slice(3, -3).trim();
    return `<div style="text-align:right">\n\n${inner}\n\n</div>`;
  }
  if (trimmed.match(/^->(.+)<-$/)) {
    const inner = trimmed.slice(2, -2).trim();
    return `<div style="text-align:center">\n\n${inner}\n\n</div>`;
  }
  if (trimmed.match(/^\^\^\^(.+)\^\^\^$/)) {
    const inner = trimmed.slice(3, -3).trim();
    return `<span style="font-size:1.35rem;line-height:1.6">\n\n${inner}\n\n</span>`;
  }
  return line;
}

function buildCallout(type: string, lines: string[]): string {
  const processedLines = lines.map(processCalloutLine);
  const content = processedLines.join("\n").trim();
  const styles: Record<string, string> = {
    highlight: "background:var(--color-callout-highlight-bg);border-left:4px solid var(--color-callout-highlight-border);padding:1rem 1.25rem;border-radius:0.5rem;margin:1rem 0",
    info: "background:var(--color-callout-info-bg);border-left:4px solid var(--color-callout-info-border);padding:1rem 1.25rem;border-radius:0.5rem;margin:1rem 0",
    warning: "background:var(--color-callout-warning-bg);border-left:4px solid var(--color-callout-warning-border);padding:1rem 1.25rem;border-radius:0.5rem;margin:1rem 0",
  };
  return `<div style="${styles[type] || styles.highlight}">\n\n${content}\n\n</div>`;
}

interface MarkdownWithWidgetsProps {
  content: string;
  className?: string;
  compact?: boolean;
}

export function MarkdownWithWidgets({ content, className, compact }: MarkdownWithWidgetsProps) {
  const { settings } = useSettings();
  const safeContent = content || "";

  let customTagNames: string[] = [];
  try {
    const tags: { name: string }[] = settings.customWidgetTags ? JSON.parse(settings.customWidgetTags) : [];
    customTagNames = tags.map(t => t.name);
  } catch (e) {}

  let screenshotLib: { id: string; name: string; imagePath: string }[] = [];
  try {
    screenshotLib = settings.screenshotLibrary ? JSON.parse(settings.screenshotLibrary) : [];
  } catch {}

  const allTagPattern = ['schools', 'telegram', 'committee', ...customTagNames].join('|');
  const hasWidget = new RegExp(`\\{\\{(${allTagPattern})\\}\\}`, 'i').test(safeContent);
  const hasScreenshot = /\{\{screenshot:[^}]+\}\}/i.test(safeContent);

  if (!hasWidget && !hasScreenshot) {
    return (
      <div className={className}>
        <div className="prose prose-lg max-w-none prose-headings:text-navy prose-a:text-sky hover:prose-a:text-sky-dark prose-img:rounded-xl prose-img:shadow-md">
          <LazyMarkdown variant="sanitized">{processStyleSyntax(safeContent)}</LazyMarkdown>
        </div>
      </div>
    );
  }

  function replaceScreenshotTags(text: string): string {
    const lines = text.split("\n");
    let inCode = false;
    return lines.map(line => {
      if (line.trimStart().startsWith("```")) inCode = !inCode;
      if (inCode) return line;
      return line.replace(/\{\{screenshot:([^}]+)\}\}/gi, (_m, ssId) => {
        const entry = screenshotLib.find(s => s.id === ssId.trim());
        if (!entry) return `*[Screenshot not found: ${ssId}]*`;
        return `<div class="my-4"><img src="${entry.imagePath}" alt="${entry.name}" style="max-width:100%;border-radius:0.75rem;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1)" /></div>`;
      });
    }).join("\n");
  }

  if (hasScreenshot && !hasWidget) {
    const rendered = replaceScreenshotTags(safeContent);
    return (
      <div className={className}>
        <div className="prose prose-lg max-w-none prose-headings:text-navy prose-a:text-sky hover:prose-a:text-sky-dark prose-img:rounded-xl prose-img:shadow-md">
          <LazyMarkdown variant="sanitized">{processStyleSyntax(rendered)}</LazyMarkdown>
        </div>
      </div>
    );
  }

  const processedContent = replaceScreenshotTags(safeContent);

  const lines = processedContent.split("\n");
  const chunks: { type: "markdown" | "schools" | "telegram" | "committee" | "custom"; lines: string[]; tagName?: string }[] = [];
  let currentLines: string[] = [];
  let inCodeBlock = false;

  const wholeLineRegex = new RegExp(`^\\{\\{(${allTagPattern})\\}\\}$`, 'i');
  const inlineRegex = new RegExp(`\\{\\{(${allTagPattern})\\}\\}`, 'i');

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    const trimmed = line.trim().toLowerCase();
    const wholeMatch = !inCodeBlock ? trimmed.match(wholeLineRegex) : null;

    if (wholeMatch) {
      if (currentLines.length > 0) {
        chunks.push({ type: "markdown", lines: currentLines });
        currentLines = [];
      }
      const tag = wholeMatch[1];
      if (tag === "schools") {
        chunks.push({ type: "schools", lines: [] });
      } else if (tag === "telegram") {
        chunks.push({ type: "telegram", lines: [] });
      } else if (tag === "committee") {
        chunks.push({ type: "committee", lines: [] });
      } else {
        chunks.push({ type: "custom", lines: [], tagName: tag });
      }
    } else if (!inCodeBlock && inlineRegex.test(line)) {
      const inlineGlobal = new RegExp(`\\{\\{(${allTagPattern})\\}\\}`, 'gi');
      let lastIndex = 0;
      let m;
      while ((m = inlineGlobal.exec(line)) !== null) {
        const before = line.slice(lastIndex, m.index);
        if (before.trim()) {
          currentLines.push(before);
        }
        if (currentLines.length > 0) {
          chunks.push({ type: "markdown", lines: currentLines });
          currentLines = [];
        }
        const tag = m[1].toLowerCase();
        if (tag === "schools") {
          chunks.push({ type: "schools", lines: [] });
        } else if (tag === "telegram") {
          chunks.push({ type: "telegram", lines: [] });
        } else if (tag === "committee") {
          chunks.push({ type: "committee", lines: [] });
        } else {
          chunks.push({ type: "custom", lines: [], tagName: tag });
        }
        lastIndex = m.index + m[0].length;
      }
      const after = line.slice(lastIndex);
      if (after.trim()) {
        currentLines.push(after);
      }
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    chunks.push({ type: "markdown", lines: currentLines });
  }

  return (
    <div className={className}>
      {chunks.map((chunk, i) => {
        if (chunk.type === "schools") {
          return <SchoolsWidget key={i} />;
        }
        if (chunk.type === "telegram") {
          return <TelegramWidget key={i} />;
        }
        if (chunk.type === "committee") {
          return <CommitteeWidget key={i} compact={compact} />;
        }
        if (chunk.type === "custom" && chunk.tagName) {
          return <CustomTagWidget key={i} tagName={chunk.tagName} />;
        }
        const text = chunk.lines.join("\n");
        if (!text.trim()) return null;
        return (
          <div key={i} className="prose prose-lg max-w-none prose-headings:text-navy prose-a:text-sky hover:prose-a:text-sky-dark prose-img:rounded-xl prose-img:shadow-md">
            <LazyMarkdown variant="sanitized">{processStyleSyntax(text)}</LazyMarkdown>
          </div>
        );
      })}
    </div>
  );
}

function SafetyOfficerWidget() {
  const { data: officers = [], isLoading } = useSafetyOfficers();

  const selected = useMemo(() => {
    if (officers.length === 0) return [];
    const ssos = officers.filter(o => o.safetyOfficerType === 'SSO');
    const sos  = officers.filter(o => o.safetyOfficerType === 'SO');
    const shuffledSSOs = [...ssos].sort(() => Math.random() - 0.5).slice(0, 2);
    const pickedSSO = shuffledSSOs;
    const shuffledSOs = [...sos].sort(() => Math.random() - 0.5).slice(0, 5);
    return [...pickedSSO, ...shuffledSOs];
  }, [officers]);

  if (isLoading) return <div className="my-2 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-400"></div></div>;
  if (selected.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-1.5 mt-2">
      {selected.map(officer => {
        const displayName = [officer.name, officer.surname].filter(Boolean).join(' ');
        const role = officer.safetyOfficerType || 'SO';
        return (
          <span
            key={officer.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange/10 text-white rounded-full text-xs font-medium border border-orange/20"
          >
            {displayName}
            <span className="text-white/70 font-normal">· {role}</span>
          </span>
        );
      })}
    </div>
  );
}

function FlyingSitesWidget() {
  const { data: sites = [], isLoading } = useSites(true);

  const selected = useMemo(() => {
    const skyhigh = sites.filter(s => s.isSkyHighSite === 'true');
    return [...skyhigh].sort(() => Math.random() - 0.5).slice(0, 6);
  }, [sites]);

  if (isLoading) return <div className="my-2 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-400"></div></div>;
  if (selected.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-1.5 mt-2">
      {selected.map(site => (
        <Link
          key={site.id}
          to={`/sites/${site.id}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky/10 text-white rounded-full text-xs font-medium border border-sky/20 hover:bg-sky/20 transition-colors"
        >
          {site.name}
        </Link>
      ))}
    </div>
  );
}

export { SchoolsWidget, TelegramWidget, CommitteeWidget, SafetyOfficerWidget, FlyingSitesWidget };
