import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { WonderfulHeader } from "@/templates/wonderful-white/WonderfulHeader";
import { WonderfulFooter } from "@/templates/wonderful-white/WonderfulFooter";

export function Layout() {
  const { settings, lightLogos } = useSettings();
  const clubName = settings.clubName || "SkyHigh";

  useEffect(() => {
    document.title = clubName;
    const favicon = lightLogos.favicon;
    if (favicon) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = favicon;
    }

    let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = "/manifest.json";
      document.head.appendChild(manifestLink);
    }

    const appleTouchIcon = settings.pwaIcon192 || lightLogos.favicon;
    if (appleTouchIcon) {
      let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
      if (!appleLink) {
        appleLink = document.createElement("link");
        appleLink.rel = "apple-touch-icon";
        document.head.appendChild(appleLink);
      }
      appleLink.href = appleTouchIcon;
    }

    let themeColor = document.querySelector("meta[name='theme-color']") as HTMLMetaElement;
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.appendChild(themeColor);
    }
    themeColor.content = settings.clubPrimaryColor || "#00a8e8";

    let mobileCapable = document.querySelector("meta[name='mobile-web-app-capable']") as HTMLMetaElement;
    if (!mobileCapable) {
      mobileCapable = document.createElement("meta");
      mobileCapable.name = "mobile-web-app-capable";
      mobileCapable.content = "yes";
      document.head.appendChild(mobileCapable);
    }

    let appleMobileCapable = document.querySelector("meta[name='apple-mobile-web-app-capable']") as HTMLMetaElement;
    if (!appleMobileCapable) {
      appleMobileCapable = document.createElement("meta");
      appleMobileCapable.name = "apple-mobile-web-app-capable";
      appleMobileCapable.content = "yes";
      document.head.appendChild(appleMobileCapable);
    }
  }, [clubName, lightLogos.favicon, settings.pwaIcon192, settings.clubPrimaryColor]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--tmpl-body-bg)" }}>
      <WonderfulHeader />
      <main className="flex-grow flex flex-col pt-[56px] sm:pt-[76px]">
        <Outlet />
      </main>
      <WonderfulFooter />
    </div>
  );
}
