"use client";

import { useEffect } from "react";

export default function NumberInputDefaults() {
  useEffect(() => {
    function stopWheelValueChange(event) {
      const input = event.target;
      if (
        input instanceof HTMLInputElement &&
        input.type === "number" &&
        document.activeElement === input
      ) {
        event.preventDefault();
      }
    }
    function clearDefaultZeros(root = document) {
      const inputs = root.querySelectorAll?.('input[type="number"]') || [];
      inputs.forEach((input) => {
        if (input.defaultValue === "0" && input.value === "0") input.value = "";
      });
    }
    clearDefaultZeros();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) =>
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) clearDefaultZeros(node);
        }),
      );
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("wheel", stopWheelValueChange, {
      capture: true,
      passive: false,
    });
    return () => {
      observer.disconnect();
      document.removeEventListener("wheel", stopWheelValueChange, true);
    };
  }, []);
  return null;
}
