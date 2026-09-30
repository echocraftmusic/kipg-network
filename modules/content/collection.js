export async function loadCollection(url) {
  const data = await window.EC.data.loadJson(url);
  if (!Array.isArray(data)) throw new Error("Content collection must be a JSON array.");
  return data;
}

export function renderCollection({ container, items, renderItem }) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) throw new Error("Content collection container was not found.");

  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => {
    const element = renderItem(item, index);
    if (!(element instanceof Element)) throw new Error("renderItem must return a DOM element.");
    fragment.append(element);
  });
  target.replaceChildren(fragment);
  window.EC?.events.emit("ec:collection-rendered", { count: items.length });
}

export function filterCollection(items, { query = "", fields = [] } = {}) {
  const needle = String(query).trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => fields.some((field) => String(item?.[field] ?? "").toLowerCase().includes(needle)));
}

