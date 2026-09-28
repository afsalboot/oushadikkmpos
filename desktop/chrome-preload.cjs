const { ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  for (const button of document.querySelectorAll("[data-menu]")) {
    button.addEventListener("click", () => ipcRenderer.send("chrome:menu", button.dataset.menu));
  }
});
