import "./ec-framework.js";
import { initializeTheme } from "./theme-manager.js";
import { initializeNavigation } from "./navigation.js";
import { initializeModals } from "./modal.js";
import { initializeForms } from "./forms.js";
import { loadSiteConfig } from "./site-config.js";
import { notify } from "./notifications.js";

async function start() {
  initializeNavigation();
  initializeModals();

  let config = { defaultTheme: "cherry-executive" };
  try {
    config = await loadSiteConfig();
  } catch (error) {
    console.warn("Site configuration could not be loaded:", error);
  }

  initializeTheme(config.defaultTheme);
  initializeForms({
    async onSubmit({ form }) {
      notify("The starter form is working. Connect the project's submission service next.", { type: "success" });
      form.reset();
    },
  });

  window.EC.events.emit("ec:app-started", { config });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

