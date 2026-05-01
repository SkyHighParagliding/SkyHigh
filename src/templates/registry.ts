export interface TemplateTokens {
  '--tmpl-header-bg': string;
  '--tmpl-header-text': string;
  '--tmpl-header-border': string;
  '--tmpl-header-blur': string;
  '--tmpl-nav-hover': string;
  '--tmpl-body-bg': string;
  '--tmpl-card-bg': string;
  '--tmpl-card-border': string;
  '--tmpl-card-radius': string;
  '--tmpl-card-shadow': string;
  '--tmpl-card-hover-shadow': string;
  '--tmpl-card-blur': string;
  '--tmpl-section-bg': string;
  '--tmpl-accent': string;
  '--tmpl-accent-hover': string;
  '--tmpl-accent-text': string;
  '--tmpl-footer-bg': string;
  '--tmpl-footer-text': string;
  '--tmpl-footer-border': string;
  '--tmpl-input-bg': string;
  '--tmpl-input-border': string;
  '--tmpl-input-focus-ring': string;
  '--tmpl-heading-color': string;
  '--tmpl-font-heading': string;
  '--tmpl-font-body': string;
  '--tmpl-badge-bg': string;
  '--tmpl-badge-text': string;
  '--tmpl-mobile-menu-bg': string;
  [key: string]: string;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  tokens: TemplateTokens;
}

const classicTemplate: TemplateDefinition = {
  id: 'classic',
  name: 'Classic',
  description: 'Traditional Navy & Orange design with bold colors and strong contrasts.',
  tokens: {
    '--tmpl-header-bg': '#1a2b3c',
    '--tmpl-header-text': '#ffffff',
    '--tmpl-header-border': 'transparent',
    '--tmpl-header-blur': 'none',
    '--tmpl-nav-hover': '#00a8e8',
    '--tmpl-body-bg': '#f9fafb',
    '--tmpl-card-bg': '#ffffff',
    '--tmpl-card-border': '#e5e7eb',
    '--tmpl-card-radius': '0.5rem',
    '--tmpl-card-shadow': '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
    '--tmpl-card-hover-shadow': '0 4px 12px rgba(0,0,0,0.1)',
    '--tmpl-card-blur': 'none',
    '--tmpl-section-bg': '#f4f1ea',
    '--tmpl-accent': '#00a8e8',
    '--tmpl-accent-hover': '#0090c4',
    '--tmpl-accent-text': '#ffffff',
    '--tmpl-footer-bg': '#1a2b3c',
    '--tmpl-footer-text': '#9ca3af',
    '--tmpl-footer-border': '#00a8e8',
    '--tmpl-input-bg': '#ffffff',
    '--tmpl-input-border': '#d1d5db',
    '--tmpl-input-focus-ring': '#00a8e8',
    '--tmpl-heading-color': '#1a2b3c',
    '--tmpl-font-heading': '"Montserrat", ui-sans-serif, system-ui, sans-serif',
    '--tmpl-font-body': '"Roboto", ui-sans-serif, system-ui, sans-serif',
    '--tmpl-badge-bg': '#ff6b35',
    '--tmpl-badge-text': '#ffffff',
    '--tmpl-mobile-menu-bg': '#2c425a',
  },
};

const wonderfulWhiteTemplate: TemplateDefinition = {
  id: 'wonderful-white',
  name: 'Wonderful White',
  description: 'Clean, modern Apple-inspired design with frosted glass and subtle shadows.',
  tokens: {
    '--tmpl-header-bg': 'rgba(134,134,139,0.92)',
    '--tmpl-header-text': '#ffffff',
    '--tmpl-header-border': 'rgba(255,255,255,0.1)',
    '--tmpl-header-blur': 'blur(20px) saturate(180%)',
    '--tmpl-nav-hover': '#007aff',
    '--tmpl-body-bg': '#f5f5f7',
    '--tmpl-card-bg': 'rgba(255,255,255,0.65)',
    '--tmpl-card-border': 'rgba(255,255,255,0.3)',
    '--tmpl-card-radius': '1.25rem',
    '--tmpl-card-shadow': '0 4px 24px rgba(0,0,0,0.06)',
    '--tmpl-card-hover-shadow': '0 8px 40px rgba(0,0,0,0.10)',
    '--tmpl-card-blur': 'blur(20px) saturate(180%)',
    '--tmpl-section-bg': '#f5f5f7',
    '--tmpl-accent': '#007aff',
    '--tmpl-accent-hover': '#0063d1',
    '--tmpl-accent-text': '#ffffff',
    '--tmpl-footer-bg': '#ffffff',
    '--tmpl-footer-text': '#86868b',
    '--tmpl-footer-border': 'rgba(0,0,0,0.06)',
    '--tmpl-input-bg': '#f5f5f7',
    '--tmpl-input-border': 'rgba(0,0,0,0.06)',
    '--tmpl-input-focus-ring': '#007aff',
    '--tmpl-heading-color': '#1d1d1f',
    '--tmpl-font-heading': '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
    '--tmpl-font-body': '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    '--tmpl-badge-bg': '#007aff',
    '--tmpl-badge-text': '#ffffff',
    '--tmpl-mobile-menu-bg': 'rgba(134,134,139,0.95)',
  },
};

export const templates: Record<string, TemplateDefinition> = {
  classic: classicTemplate,
  'wonderful-white': wonderfulWhiteTemplate,
};

export function getTemplate(id: string): TemplateDefinition {
  return templates[id] || classicTemplate;
}

export function getTemplateList(): TemplateDefinition[] {
  return Object.values(templates);
}
