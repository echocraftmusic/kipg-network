export function openModal(target) {
  const dialog = typeof target === "string" ? document.querySelector(target) : target;
  if (!(dialog instanceof HTMLDialogElement)) throw new Error("A dialog element is required.");
  if (!dialog.open) dialog.showModal();
  window.EC?.events.emit("ec:modal-open", { id: dialog.id });
  return dialog;
}

export function closeModal(target, returnValue = "") {
  const dialog = typeof target === "string" ? document.querySelector(target) : target;
  if (!(dialog instanceof HTMLDialogElement)) return;
  if (dialog.open) dialog.close(returnValue);
  window.EC?.events.emit("ec:modal-close", { id: dialog.id, returnValue });
}

export function initializeModals() {
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-ec-modal-open]");
    if (opener) openModal(opener.dataset.ecModalOpen);

    const closer = event.target.closest("[data-ec-modal-close]");
    if (closer) closeModal(closer.closest("dialog"));
  });

  document.querySelectorAll("dialog.ec-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeModal(dialog);
    });
  });
}

