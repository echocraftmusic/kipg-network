import "../../core/js/ec-framework.js";
import { ECStorage } from "./storage.js";
import { ECRepository } from "./repository.js";
import { bindData } from "./data-binding.js";
import { notify } from "../../core/js/notifications.js";
import { initializeTheme } from "../../core/js/theme-manager.js";

const storage = new ECStorage("ec-framework-demo");
const inquiries = new ECRepository({ storage, collection: "inquiries", idPrefix: "INQ" });

function ensureDemoData() {
  if (inquiries.all().length) return;
  inquiries.create({ name: "Sample inquiry", email: "sample@example.com", status: "new" });
}

function render() {
  const items = inquiries.all();
  bindData({ metrics: { inquiries: items.length, new: items.filter((item) => item.status === "new").length } });
  const body = document.querySelector("[data-inquiry-rows]");
  if (!body) return;
  body.replaceChildren(...items.map((item) => {
    const row = document.createElement("tr");
    [item.name, item.email, item.status, window.EC.format.date(item.createdAt)].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    return row;
  }));
}

function start() {
  initializeTheme();
  ensureDemoData();
  render();
  window.EC.events.on("ec:storage-change", render);
  document.querySelector("[data-add-demo]")?.addEventListener("click", () => {
    inquiries.create({ name: "New inquiry", email: "lead@example.com", status: "new" });
    notify("Sample inquiry added.", { type: "success" });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
