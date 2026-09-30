function readPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

export function bindData(data, scope = document) {
  scope.querySelectorAll("[data-ec-bind]").forEach((element) => {
    const value = readPath(data, element.dataset.ecBind);
    if (value === undefined || value === null) return;
    element.textContent = String(value);
  });

  scope.querySelectorAll("[data-ec-bind-attr]").forEach((element) => {
    const [attribute, path] = element.dataset.ecBindAttr.split(":");
    const value = readPath(data, path);
    if (attribute && value !== undefined && value !== null) element.setAttribute(attribute, String(value));
  });
}

