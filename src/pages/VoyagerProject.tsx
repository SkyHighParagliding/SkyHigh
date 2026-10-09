// The Voyager Project is a separate Streamlit app (own repo + database).
// It is embedded here with an iframe. The origin below must also be listed in
// `frame-src` in server.ts, otherwise the browser blocks the frame.
const VOYAGER_APP_BASE = "https://skyhighvoyagers.streamlit.app/";
// Streamlit Community Cloud only renders inside an iframe when "?embed=true" is present.
const VOYAGER_APP_EMBED_URL = `${VOYAGER_APP_BASE}?embed=true`;

export function VoyagerProject() {
  return (
    <div style={{ background: "var(--body-bg)" }}>
      <h1 className="sr-only">Voyager Project</h1>

      <iframe
        src={VOYAGER_APP_EMBED_URL}
        title="Voyager Project"
        className="block w-full border-0 h-[calc(100dvh-56px)] sm:h-[calc(100dvh-76px)]"
        allow="fullscreen"
      />

      <p className="text-sm text-foreground-secondary text-center py-3">
        App not loading or asleep?{" "}
        <a href={VOYAGER_APP_BASE} target="_blank" rel="noopener noreferrer" className="underline">
          Open the Voyager Project in its own tab
        </a>
        .
      </p>
    </div>
  );
}
