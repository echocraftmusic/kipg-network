import "../../core/js/ec-framework.js";
import { initializeTheme } from "../../core/js/theme-manager.js";
import { sendMagicLink } from "../../integrations/supabase/session.js";

function start() {
  initializeTheme("black-onyx");
  const form = document.querySelector("[data-admin-login]");
  const status = document.querySelector("[data-login-status]");
  const warning = document.querySelector("[data-config-warning]");

  if (!window.ecSupabase) {
    warning.hidden = false;
    form.querySelector("button[type='submit']").disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    status.textContent = "Sending your secure link…";
    try {
      const email = new FormData(form).get("email");
      const redirectTo = new URL("index.html", location.href).href;
      await sendMagicLink(email, redirectTo);
      status.textContent = "Check your email for the secure sign-in link.";
    } catch (error) {
      console.error("Sign-in link failed:", error);
      status.textContent = "The sign-in link could not be sent. Please try again.";
    } finally {
      button.disabled = false;
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();

