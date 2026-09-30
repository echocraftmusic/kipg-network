function getRegion() {
  let region = document.querySelector("[data-ec-toast-region]");
  if (!region) {
    region = document.createElement("div");
    region.className = "ec-toast-region";
    region.dataset.ecToastRegion = "";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "false");
    document.body.append(region);
  }
  return region;
}

export function notify(message, { type = "info", duration = 4200 } = {}) {
  const toast = document.createElement("div");
  toast.className = "ec-toast";
  toast.dataset.type = type;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = String(message);
  getRegion().append(toast);

  const remove = () => toast.remove();
  toast.addEventListener("click", remove, { once: true });
  window.setTimeout(remove, duration);
  return toast;
}

