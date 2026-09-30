const VERSION = "2.0.0";

class EventBus extends EventTarget {
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  on(name, listener, options) {
    this.addEventListener(name, listener, options);
    return () => this.removeEventListener(name, listener, options);
  }
}

function query(selector, scope = document) {
  return scope.querySelector(selector);
}

function queryAll(selector, scope = document) {
  return [...scope.querySelectorAll(selector)];
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function formatCurrency(value, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value) || 0);
}

function formatDate(value, locale = "en-US") {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

async function loadJson(url, options = {}) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, ...options });
  if (!response.ok) throw new Error(`Unable to load ${url} (${response.status})`);
  return response.json();
}

const events = new EventBus();

export const EC = Object.freeze({
  version: VERSION,
  events,
  dom: { query, queryAll },
  text: { escapeHtml },
  format: { currency: formatCurrency, date: formatDate },
  data: { loadJson },
});

window.EC = EC;
events.emit("ec:ready", { version: VERSION });

