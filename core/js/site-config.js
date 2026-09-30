const DEFAULT_CONFIG_URL = new URL("../config/site.json", import.meta.url);

export async function loadSiteConfig(url = DEFAULT_CONFIG_URL) {
  const config = await window.EC.data.loadJson(url);
  document.querySelectorAll("[data-site-name]").forEach((element) => {
    element.textContent = config.siteName;
  });
  document.querySelectorAll("[data-site-short-name]").forEach((element) => {
    element.textContent = config.shortName;
  });
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
  window.EC.events.emit("ec:config-loaded", { config });
  return config;
}
