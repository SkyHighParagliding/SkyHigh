import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useSettings } from "./SettingsContext";
import { getTemplate, type TemplateDefinition } from "@/templates/registry";

interface TemplateContextType {
  template: TemplateDefinition;
  isWonderfulWhite: boolean;
  isClassic: boolean;
}

const TemplateContext = createContext<TemplateContextType>({
  template: getTemplate("classic"),
  isWonderfulWhite: false,
  isClassic: true,
});

export function TemplateProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  const template = useMemo(
    () => getTemplate(settings.activeTemplate || "classic"),
    [settings.activeTemplate]
  );

  const isWonderfulWhite = template.id === "wonderful-white";
  const isClassic = template.id === "classic";

  useEffect(() => {
    const root = document.documentElement;
    const tokens = template.tokens;
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
    root.setAttribute("data-template", template.id);

    if (settings.clubPrimaryColor) {
      root.style.setProperty("--tmpl-accent", settings.clubPrimaryColor);
    }

    const accent = settings.clubPrimaryColor || tokens["--tmpl-accent"];
    const accentHover = settings.clubPrimaryColor
      ? settings.clubPrimaryColor
      : tokens["--tmpl-accent-hover"];

    root.style.setProperty("--color-sky", accent);
    root.style.setProperty("--color-sky-light", accentHover);
    root.style.setProperty("--color-navy", tokens["--tmpl-heading-color"]);
    root.style.setProperty("--color-navy-light",
      template.id === "classic" ? "#2c425a" : "#424245"
    );
    root.style.setProperty("--color-orange", tokens["--tmpl-badge-bg"]);
    root.style.setProperty("--color-orange-dark",
      template.id === "classic" ? "#e55a2b" : "#0063d1"
    );
    root.style.setProperty("--color-background", tokens["--tmpl-body-bg"]);
    root.style.setProperty("--color-card", tokens["--tmpl-card-bg"]);
    root.style.setProperty("--color-border-subtle", tokens["--tmpl-card-border"]);
    root.style.setProperty("--font-sans", tokens["--tmpl-font-heading"]);
    root.style.setProperty("--font-body", tokens["--tmpl-font-body"]);
  }, [template, settings.clubPrimaryColor]);

  const providerValue = useMemo(() => ({
    template,
    isWonderfulWhite,
    isClassic,
  }), [template, isWonderfulWhite, isClassic]);

  return (
    <TemplateContext.Provider value={providerValue}>
      {children}
    </TemplateContext.Provider>
  );
}

export function useTemplate() {
  return useContext(TemplateContext);
}
