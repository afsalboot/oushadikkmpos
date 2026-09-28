const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oushadhiDesktop", {
  printReceipt: (html) => ipcRenderer.invoke("receipt:print", html),
});

// Adapt the hosted receipt iframe without changing checkout or its saved sale.
contextBridge.executeInMainWorld({
  func: () => {
    const installed = new WeakMap();
    const attach = (frame) => {
      if (frame.title !== "Thermal receipt print") return;
      const install = () => {
        const target = frame.contentWindow;
        if (!target || installed.get(frame) === target.print) return;
        let printing = false;
        const directPrint = async () => {
          if (printing) return;
          const doc = frame.contentDocument;
          if (!doc?.querySelector(".thermal-receipt")) return;
          printing = true;
          try {
            await window.oushadhiDesktop.printReceipt(doc.documentElement.outerHTML);
          } finally {
            target.dispatchEvent(new Event("afterprint"));
          }
        };
        target.print = directPrint;
        installed.set(frame, directPrint);
      };
      install();
      frame.addEventListener("load", install, { once: true });
    };
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IFRAME") attach(node);
        node.querySelectorAll("iframe").forEach(attach);
      }
    }).observe(document, { childList: true, subtree: true });
  },
});
