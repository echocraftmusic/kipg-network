export function initializeNavigation() {
  document.querySelectorAll("[data-ec-nav]").forEach((nav) => {
    const button = nav.querySelector("[data-ec-nav-toggle]");
    const links = nav.querySelector("[data-ec-nav-links]");
    if (!button || !links) return;

    const close = () => {
      links.dataset.open = "false";
      button.setAttribute("aria-expanded", "false");
    };

    button.addEventListener("click", () => {
      const open = links.dataset.open !== "true";
      links.dataset.open = String(open);
      button.setAttribute("aria-expanded", String(open));
    });

    links.addEventListener("click", (event) => {
      if (event.target.closest("a")) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });

    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target)) close();
    });
  });
}

