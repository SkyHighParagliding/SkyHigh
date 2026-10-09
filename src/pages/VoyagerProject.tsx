// The Voyager Project is a separate Streamlit app (own repo + database).
// It is embedded here with an iframe. The origin below must also be listed in
// `frame-src` in server.ts, otherwise the browser blocks the frame.
const VOYAGER_APP_BASE = "https://skyhighvoyagers.streamlit.app/";
// Streamlit Community Cloud only renders inside an iframe when "?embed=true" is present.
const VOYAGER_APP_EMBED_URL = `${VOYAGER_APP_BASE}?embed=true`;

export function VoyagerProject() {
  return (
    <div style={{ background: "var(--body-bg)" }} className="min-h-screen pt-24 pb-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl font-bold text-ink mb-1">Voyager Project</h1>
        <p className="text-foreground-secondary mb-5">
          Friendly cross-country task flying: register, pick a task, upload your tracklog and see the leaderboard.
        </p>

        <div className="rounded-xl overflow-hidden border border-border-subtle">
          <iframe
            src={VOYAGER_APP_EMBED_URL}
            title="Voyager Project"
            width="100%"
            style={{ border: 0, display: "block", height: "85vh", minHeight: 700 }}
            loading="lazy"
            allow="fullscreen"
          />
        </div>

        <p className="text-sm text-foreground-secondary mt-3">
          App not loading or asleep?{" "}
          <a href={VOYAGER_APP_BASE} target="_blank" rel="noopener noreferrer" className="underline">
            Open the Voyager Project in its own tab
          </a>
          .
        </p>
      </div>
    </div>
  );
}
