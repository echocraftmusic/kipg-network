import { notify } from "./notifications.js";

function fieldMessage(field) {
  const id = field.getAttribute("aria-describedby");
  return id ? document.getElementById(id) : null;
}

function validateField(field) {
  const valid = field.checkValidity();
  field.setAttribute("aria-invalid", String(!valid));
  const message = fieldMessage(field);
  if (message) message.textContent = valid ? "" : field.validationMessage;
  return valid;
}

export function initializeForms({ onSubmit } = {}) {
  document.querySelectorAll("form[data-ec-form]").forEach((form) => {
    form.setAttribute("novalidate", "");

    form.addEventListener("input", (event) => {
      if (event.target.matches("input, select, textarea")) validateField(event.target);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fields = [...form.elements].filter((field) => field.matches?.("input, select, textarea"));
      const valid = fields.map(validateField).every(Boolean);
      if (!valid) {
        fields.find((field) => field.getAttribute("aria-invalid") === "true")?.focus();
        notify("Please review the highlighted information.", { type: "error" });
        return;
      }

      const submitter = event.submitter;
      if (submitter) submitter.disabled = true;
      form.setAttribute("aria-busy", "true");
      try {
        const values = Object.fromEntries(new FormData(form).entries());
        if (onSubmit) await onSubmit({ form, values, event });
        window.EC?.events.emit("ec:form-success", { id: form.id, values });
      } catch (error) {
        console.error("Form submission failed:", error);
        notify("The form could not be submitted. Please try again.", { type: "error" });
        window.EC?.events.emit("ec:form-error", { id: form.id, error });
      } finally {
        form.removeAttribute("aria-busy");
        if (submitter) submitter.disabled = false;
      }
    });
  });
}
