"use client";

import { useEffect } from "react";

const HELP = {
  "customer name":
    "Enter the customer name that should appear on invoices and customer records.",
  "business name":
    "Enter the registered or trading name used by this wholesale customer.",
  phone: "Enter a reachable customer or supplier phone number.",
  email: "Enter a valid email address for communication and records.",
  address: "Enter the primary address that should be saved with this record.",
  gstin: "Enter the 15-character GST registration number, when applicable.",
  "billing address":
    "Enter the address that should appear on billing documents.",
  "shipping address":
    "Enter the address where wholesale orders are normally delivered.",
  "credit limit":
    "Enter the maximum credit amount permitted for this customer.",
  "default discount %":
    "Enter the percentage discount suggested for this wholesale customer.",
  notes:
    "Add optional internal information that may help staff handle this record.",
  reason: "Explain why this action is being performed for the audit history.",
  "reason (optional)": "Optionally record why this action is being performed.",
  "product name":
    "Enter the product name shown throughout inventory, sales and invoices.",
  sku: "Enter the store's unique stock-keeping code for this product.",
  barcode: "Enter or scan the barcode used to find this product at sale time.",
  category: "Choose the catalogue category used to organize this product.",
  "base unit": "Choose the smallest unit used to measure loose stock.",
  "package type":
    "Choose the physical container or package used for this product.",
  "package size":
    "Enter how many base units are contained in one sealed package.",
  "package price": "Enter the selling price of one complete package.",
  "loose price / unit": "Enter the selling price for one loose base unit.",
  "opening packages":
    "Enter the number of sealed packages available when creating the product.",
  "cash received":
    "Enter the cash tendered so the correct change can be calculated.",
  "transaction / reference id (optional)":
    "Optionally record the payment-provider reference for reconciliation.",
  "upi reference (optional)":
    "Optionally record the UPI transaction reference for reconciliation.",
  "place of supply":
    "Choose the GST place of supply used to determine intrastate or interstate tax.",
};

function cleanLabel(value = "") {
  return value
    .replace(/\s*\*\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function helpFor(label, control) {
  const key = cleanLabel(label).toLowerCase();
  if (HELP[key]) return HELP[key];
  if (control?.tagName === "SELECT")
    return `Choose the ${key} that applies to this record.`;
  if (control?.type === "date")
    return `Choose the ${key} date for this record.`;
  if (control?.type === "number")
    return `Enter the ${key} value used for this record.`;
  if (control?.tagName === "TEXTAREA")
    return `Add the ${key} details that should be saved with this record.`;
  return `Enter the ${key} that should be saved with this record.`;
}

export default function ModalTooltipEnhancer() {
  useEffect(() => {
    let tooltip;
    let activeTrigger;

    const hide = () => {
      tooltip?.remove();
      tooltip = null;
      activeTrigger?.setAttribute("aria-expanded", "false");
      activeTrigger?.removeAttribute("aria-describedby");
      activeTrigger = null;
    };

    const show = (trigger) => {
      if (!trigger?.dataset.modalHelp) return;
      hide();
      const rect = trigger.getBoundingClientRect();
      tooltip = document.createElement("div");
      tooltip.className = "modal-auto-tooltip";
      tooltip.id = `modal-help-${crypto.randomUUID()}`;
      tooltip.setAttribute("role", "tooltip");
      tooltip.textContent = trigger.dataset.modalHelp;
      document.body.appendChild(tooltip);
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.max(
        8,
        Math.min(
          window.innerWidth - width - 8,
          rect.left + rect.width / 2 - width / 2,
        ),
      );
      tooltip.style.width = `${width}px`;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${rect.top >= 96 ? rect.top - 8 : rect.bottom + 8}px`;
      tooltip.classList.toggle("modal-auto-tooltip-above", rect.top >= 96);
      trigger.setAttribute("aria-describedby", tooltip.id);
      trigger.setAttribute("aria-expanded", "true");
      activeTrigger = trigger;
    };

    const enhance = () => {
      document.querySelectorAll(".label").forEach((label) => {
        const modal = label.closest('[aria-modal="true"], .fixed.inset-0');
        if (!modal || modal.dataset.modalTooltipsChecked === "existing") return;
        if (
          modal.querySelector(
            '[aria-label^="Help"], [aria-label^="More information"]:not(.modal-auto-tip), [data-modal-help-existing]',
          )
        ) {
          modal.dataset.modalTooltipsChecked = "existing";
          modal
            .querySelectorAll(".modal-auto-tip")
            .forEach((node) => node.remove());
          return;
        }
        if (label.querySelector(".modal-auto-tip")) return;
        const control =
          label.parentElement?.querySelector("input, select, textarea") ||
          label.nextElementSibling;
        const text = cleanLabel(label.textContent);
        if (!text || !control?.matches?.("input, select, textarea")) return;
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "modal-auto-tip";
        trigger.textContent = "i";
        trigger.dataset.modalHelp = helpFor(text, control);
        trigger.setAttribute("aria-label", `More information about ${text}`);
        trigger.setAttribute("aria-expanded", "false");
        label.appendChild(trigger);
      });
    };

    const onPointerOver = (event) =>
      event.target.closest?.(".modal-auto-tip") &&
      show(event.target.closest(".modal-auto-tip"));
    const onPointerOut = (event) =>
      event.target.closest?.(".modal-auto-tip") && hide();
    const onFocus = (event) =>
      event.target.matches?.(".modal-auto-tip") && show(event.target);
    const onBlur = (event) =>
      event.target.matches?.(".modal-auto-tip") && hide();
    const onClick = (event) => {
      const trigger = event.target.closest?.(".modal-auto-tip");
      if (!trigger) return hide();
      event.preventDefault();
      event.stopPropagation();
      activeTrigger === trigger ? hide() : show(trigger);
    };
    const onKeyDown = (event) => event.key === "Escape" && hide();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("mouseover", onPointerOver);
    document.addEventListener("mouseout", onPointerOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    enhance();
    return () => {
      observer.disconnect();
      hide();
      document.removeEventListener("mouseover", onPointerOver);
      document.removeEventListener("mouseout", onPointerOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document
        .querySelectorAll(".modal-auto-tip")
        .forEach((node) => node.remove());
    };
  }, []);

  return null;
}
