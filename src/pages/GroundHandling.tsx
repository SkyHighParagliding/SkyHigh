import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

const GOOGLE_MAPS_MID = "12KBoOkwtN3J9IR97C7RqUwM1ajNR7Lxu";
const GOOGLE_MAPS_EMBED_URL = `https://www.google.com/maps/d/embed?mid=${GOOGLE_MAPS_MID}&femb=1&ll=-37.7984976049839,145.3619694673158&z=9`;
const GOOGLE_MAPS_VIEWER_URL = `https://www.google.com/maps/d/viewer?mid=${GOOGLE_MAPS_MID}&femb=1&ll=-37.7984976049839,145.3619694673158&z=9`;

export function GroundHandling() {
  const { settings } = useSettings();

  if (settings.groundHandlingEnabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-navy mb-2">Page Not Found</h1>
          <Link to="/" className="text-sky hover:underline">Return Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#f5f5f7" }} className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center text-[#007aff] hover:opacity-80 mb-6 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>

        <div className="mb-6">
          <h1
            className="text-4xl md:text-5xl font-extrabold mb-4"
            style={{ color: "#1d1d1f", fontFamily: "var(--tmpl-font-heading, 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif)" }}
          >
            Ground Handling Sites
          </h1>
          <p
            className="text-lg max-w-3xl mb-4"
            style={{ color: "#86868b", fontFamily: "var(--tmpl-font-body, 'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif)" }}
          >
            This map is created by paragliding pilots to help find the best nearby ground handling locations.
            Select a location, read the description, and click the directions icon to open it in Google Maps.
          </p>
          <div className="flex flex-wrap gap-4 mb-6">
            <a
              href={GOOGLE_MAPS_VIEWER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: "#007aff" }}
            >
              <ExternalLink className="w-4 h-4" />
              Open full screen map
            </a>
          </div>
        </div>

        <div
          className="rounded-2xl overflow-hidden shadow-lg"
          style={{
            background: "rgba(255, 255, 255, 0.72)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(0, 0, 0, 0.08)",
          }}
        >
          <iframe
            src={GOOGLE_MAPS_EMBED_URL}
            width="100%"
            height="700"
            style={{ border: 0, display: "block" }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Ground Handling Sites Map"
          />
        </div>

        <p
          className="text-sm mt-4 text-center"
          style={{ color: "#aeaeb2", fontFamily: "var(--tmpl-font-body, 'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif)" }}
        >
          Star the map to see it in your Google Maps app. For mobile, open the map in full-screen.
        </p>
      </div>
    </div>
  );
}
