// Tema: preferência persistida (sistema por padrão), aplicada via data-theme
// no <html> — o CSS resolve com variáveis. Além de claro/escuro/sistema há
// temas nomeados (paletas fixas) que sobrepõem o accent do app.

export type NamedTheme = "nature" | "darkblue" | "calmgreen" | "pastelpink" | "punkprincess";
export type ThemePref = "system" | "light" | "dark" | NamedTheme;

export const NAMED_THEMES: NamedTheme[] = [
  "nature",
  "darkblue",
  "calmgreen",
  "pastelpink",
  "punkprincess",
];

export const THEME_PREFS: ThemePref[] = ["system", "light", "dark", ...NAMED_THEMES];

const KEY = "localpdf.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v !== null && (THEME_PREFS as string[]).includes(v) ? (v as ThemePref) : "system";
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  // Nomeados vão direto pro data-theme; "system" resolve pela mídia.
  const resolved = pref === "system" ? (media.matches ? "dark" : "light") : pref;
  document.documentElement.dataset.theme = resolved;
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

export function cycleTheme(): ThemePref {
  const next = THEME_PREFS[(THEME_PREFS.indexOf(getThemePref()) + 1) % THEME_PREFS.length];
  setThemePref(next);
  return next;
}

export function initTheme(): void {
  applyTheme();
  media.addEventListener("change", () => applyTheme());
}
