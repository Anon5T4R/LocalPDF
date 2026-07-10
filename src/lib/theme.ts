// Tema claro/escuro: preferência persistida (sistema por padrão), aplicada
// via data-theme no <html> — o CSS resolve com variáveis.

export type ThemePref = "system" | "light" | "dark";

const KEY = "localpdf.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = pref === "dark" || (pref === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

export function cycleTheme(): ThemePref {
  const order: ThemePref[] = ["system", "light", "dark"];
  const next = order[(order.indexOf(getThemePref()) + 1) % order.length];
  setThemePref(next);
  return next;
}

export function initTheme(): void {
  applyTheme();
  media.addEventListener("change", () => applyTheme());
}
