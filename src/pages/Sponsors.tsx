import { SponsorCard } from "@/components/SponsorCard";
import { Handshake } from "lucide-react";
import { useSponsors } from "@/hooks/api";

export function Sponsors() {
  const { data: sponsors = [] } = useSponsors();

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Handshake className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-4xl font-extrabold text-navy mb-3">Our Sponsors</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We're grateful to these partners who support our club and the paragliding community.
          </p>
          <div className="mt-4 w-24 h-1 mx-auto bg-gradient-to-r from-amber-300 via-amber-500 to-amber-300 rounded-full" />
        </div>

        {sponsors.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Handshake className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No sponsors listed at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sponsors.map((sponsor) => (
              <SponsorCard
                key={sponsor.id}
                name={sponsor.name}
                logo={sponsor.logo}
                url={sponsor.url}
                markdown={sponsor.markdown}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
