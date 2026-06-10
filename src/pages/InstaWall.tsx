import { useMemo } from "react";
import { useSettings } from "@/contexts/SettingsContext";

interface InstaEmbed {
  embedCode: string;
  addedAt: string;
}

function extractInstagramUrl(embedCode: string): string | null {
  const match = embedCode.match(/https:\/\/www\.instagram\.com\/(?:p|reel|tv)\/[\w-]+\/?/);
  return match ? match[0] : null;
}

function EmbedTile({ postUrl }: { postUrl: string | null }) {
  if (!postUrl) {
    return (
      <div className="overflow-hidden bg-card border border-border rounded-lg flex items-center justify-center text-muted-foreground text-sm aspect-[4/5]">
        Invalid embed
      </div>
    );
  }

  const cleanUrl = postUrl.endsWith("/") ? postUrl : postUrl + "/";
  const iframeSrc = `${cleanUrl}embed/`;

  return (
    <div className="overflow-hidden bg-card border border-border rounded-lg aspect-[4/5]">
      <iframe
        src={iframeSrc}
        className="w-full h-full border-0"
        allowTransparency
        allow="encrypted-media"
        loading="lazy"
        title="Instagram post"
      />
    </div>
  );
}

export function InstaWall() {
  const { settings, loading } = useSettings();

  const embeds = useMemo<InstaEmbed[]>(() => {
    if (!settings.instagramEmbeds) return [];
    try {
      return JSON.parse(settings.instagramEmbeds as string);
    } catch {
      return [];
    }
  }, [settings.instagramEmbeds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky" />
      </div>
    );
  }

  if (embeds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-foreground-secondary">
        No Instagram posts available yet.
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="pt-8 pb-12 px-2 sm:px-4">
        <h1 className="text-3xl font-bold text-foreground text-center mb-8">
          SkyHigh Insta Wall
        </h1>
        <div
          className="grid gap-[10px] max-w-5xl mx-auto"
          style={{
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          {embeds.map((embed, i) => {
            const postUrl = extractInstagramUrl(embed.embedCode);
            return <EmbedTile key={i} postUrl={postUrl} />;
          })}
        </div>
      </div>
    </div>
  );
}
