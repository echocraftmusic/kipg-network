const STORAGE_KEY = "kipg-network-theme";
const THEMES = new Set(["kipg-light", "kipg-dark"]);

export function setTheme(value, { persist = true } = {}) {
  const theme = THEMES.has(value) ? value : "kipg-dark";
  document.documentElement.dataset.ecTheme = theme;
  if (persist) localStorage.setItem(STORAGE_KEY, theme);

  document.querySelectorAll("[data-ec-theme-toggle]").forEach((button) => {
    const isDark = theme === "kipg-dark";
    const next = isDark ? "light mode" : "dark mode";
    button.setAttribute("aria-label", `Switch to ${next}`);
    button.setAttribute("title", `Switch to ${next}`);
    button.setAttribute("aria-pressed", String(isDark));
    const label = button.querySelector("[data-theme-label]");
    if (label) label.textContent = isDark ? "☀︎" : "☾";
  });

  window.EC?.events.emit("ec:theme-change", { theme });
  return theme;
}

export function initializeTheme(defaultTheme = "kipg-dark") {
  const saved = localStorage.getItem(STORAGE_KEY);
  const preferred = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "kipg-light" : defaultTheme;
  const theme = setTheme(saved || preferred, { persist: Boolean(saved) });
  document.querySelectorAll("[data-ec-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      setTheme(document.documentElement.dataset.ecTheme === "kipg-dark" ? "kipg-light" : "kipg-dark");
    });
  });
  return theme;
}
