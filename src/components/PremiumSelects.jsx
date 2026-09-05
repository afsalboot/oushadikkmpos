"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Search } from "lucide-react";

const MENU_ID = "premium-select-menu";
const SEARCH_THRESHOLD = 8;

function readOptions(select) {
  return Array.from(select?.options || []).map((option, index) => ({
    index,
    value: option.value,
    label: option.textContent?.trim() || option.label || option.value,
    selected: option.selected,
    disabled: option.disabled,
    action:
      option.value.startsWith("__") ||
      /^\+\s/.test(option.textContent?.trim() || ""),
  }));
}

function selectedLabel(select) {
  if (!select.multiple) {
    return (
      select.options[select.selectedIndex]?.textContent?.trim() ||
      "Select an option"
    );
  }
  const selected = Array.from(select.selectedOptions)
    .map((option) => option.textContent?.trim())
    .filter(Boolean);
  if (!selected.length)
    return (
      select.dataset.placeholder ||
      Array.from(select.options)
        .find((option) => option.value === "")
        ?.textContent?.trim() ||
      "Select options"
    );
  if (selected.length <= 2) return selected.join(", ");
  return `${selected[0]} +${selected.length - 1}`;
}

function positionMenu(trigger, options) {
  const rect = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportHeight = viewport?.height || window.innerHeight;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const viewportRight = viewportLeft + viewportWidth;
  const searchable = options.length >= SEARCH_THRESHOLD;
  const estimatedHeight = Math.min(
    360,
    options.length * 46 + (searchable ? 62 : 0) + 16,
  );
  const below = viewportBottom - rect.bottom - 8;
  const above = rect.top - viewportTop - 8;
  const openUp = below < Math.min(estimatedHeight, 240) && above > below;
  const maxHeight = Math.min(
    estimatedHeight,
    Math.max(140, openUp ? above : below),
  );
  const longest = Math.max(0, ...options.map((option) => option.label.length));
  const width = Math.min(
    viewportWidth - 24,
    Math.max(rect.width, Math.min(420, longest * 7.5 + 70)),
  );
  const left = Math.min(
    Math.max(viewportLeft + 12, rect.left),
    viewportRight - width - 12,
  );
  const top = openUp
    ? Math.max(viewportTop + 8, rect.top - maxHeight - 8)
    : rect.bottom + 8;
  return { left, top, width, maxHeight, openUp };
}

export default function PremiumSelects() {
  const [activeSelect, setActiveSelect] = useState(null);
  const [options, setOptions] = useState([]);
  const [geometry, setGeometry] = useState(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuLabel, setMenuLabel] = useState("Select an option");
  const activeSelectRef = useRef(null);
  const activeIndexRef = useRef(0);
  const filteredRef = useRef([]);
  const menuRef = useRef(null);
  const triggersRef = useRef(new Map());
  const selectsRef = useRef(new WeakMap());

  const searchable = options.length >= SEARCH_THRESHOLD;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? options.filter((option) =>
          option.label.toLowerCase().includes(normalized),
        )
      : options;
  }, [options, query]);

  function triggerFor(select) {
    return triggersRef.current.get(select);
  }

  function syncTrigger(select) {
    const trigger = triggerFor(select);
    if (!trigger) return;
    const label = selectedLabel(select);
    const className = `${select.className} premium-select-trigger`.trim();
    const placeholder = select.multiple
      ? select.selectedOptions.length
        ? "false"
        : "true"
      : select.value === ""
        ? "true"
        : "false";
    const invalid = select.getAttribute("aria-invalid") || "false";
    if (trigger.textContent !== label) trigger.textContent = label;
    if (trigger.className !== className) trigger.className = className;
    if (trigger.disabled !== select.disabled)
      trigger.disabled = select.disabled;
    if (trigger.dataset.placeholder !== placeholder)
      trigger.dataset.placeholder = placeholder;
    if (trigger.dataset.multiple !== String(select.multiple))
      trigger.dataset.multiple = String(select.multiple);
    if (trigger.getAttribute("aria-invalid") !== invalid)
      trigger.setAttribute("aria-invalid", invalid);
  }

  function close({ focus = false } = {}) {
    const select = activeSelectRef.current;
    const trigger = select && triggerFor(select);
    if (trigger) {
      delete trigger.dataset.selectOpen;
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-controls");
      trigger.removeAttribute("aria-activedescendant");
      if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
    activeSelectRef.current = null;
    setActiveSelect(null);
    setGeometry(null);
    setQuery("");
  }

  function updatePosition(select = activeSelectRef.current) {
    const trigger = select && triggerFor(select);
    if (!select?.isConnected || !trigger?.isConnected) return close();
    const nextOptions = readOptions(select);
    setGeometry(positionMenu(trigger, nextOptions));
  }

  function open(select) {
    const trigger = triggerFor(select);
    if (!select || select.disabled || !trigger) return;
    if (activeSelectRef.current === select) return close({ focus: true });
    const previousTrigger =
      activeSelectRef.current && triggerFor(activeSelectRef.current);
    if (previousTrigger) delete previousTrigger.dataset.selectOpen;
    const nextOptions = readOptions(select);
    const selectedIndex = Math.max(
      0,
      nextOptions.findIndex((option) => option.index === select.selectedIndex),
    );
    activeSelectRef.current = select;
    activeIndexRef.current = selectedIndex;
    filteredRef.current = nextOptions;
    trigger.dataset.selectOpen = "true";
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", MENU_ID);
    setActiveSelect(select);
    setMenuLabel(trigger.getAttribute("aria-label") || "Select an option");
    setOptions(nextOptions);
    setActiveIndex(selectedIndex);
    setQuery("");
    setGeometry(positionMenu(trigger, nextOptions));
    trigger.focus({ preventScroll: true });
  }

  function choose(option) {
    const select = activeSelectRef.current;
    if (!select || option.disabled) return;
    if (select.multiple && !option.action) {
      const nativeOption = select.options[option.index];
      if (option.value === "") {
        Array.from(select.options).forEach((entry) => {
          entry.selected = false;
        });
      } else {
        const emptyOption = Array.from(select.options).find(
          (entry) => entry.value === "",
        );
        if (emptyOption) emptyOption.selected = false;
        nativeOption.selected = !nativeOption.selected;
      }
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const nextOptions = readOptions(select);
      setOptions(nextOptions);
      filteredRef.current = query.trim()
        ? nextOptions.filter((item) =>
            item.label.toLowerCase().includes(query.trim().toLowerCase()),
          )
        : nextOptions;
      requestAnimationFrame(() => syncTrigger(select));
      return;
    }
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    requestAnimationFrame(() => syncTrigger(select));
    close({ focus: true });
  }

  function moveActive(direction) {
    const list = filteredRef.current;
    if (!list.length) return;
    let next = activeIndexRef.current;
    for (let count = 0; count < list.length; count += 1) {
      next =
        direction === "first"
          ? 0
          : direction === "last"
            ? list.length - 1
            : (next + direction + list.length) % list.length;
      if (!list[next]?.disabled) {
        activeIndexRef.current = next;
        setActiveIndex(next);
        return;
      }
    }
  }

  function chooseActive() {
    const option = filteredRef.current[activeIndexRef.current];
    if (option) choose(option);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveActive("first");
    } else if (event.key === "End") {
      event.preventDefault();
      moveActive("last");
    } else if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      chooseActive();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close({ focus: true });
    }
  }

  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll("select").forEach((select) => {
        const existing = triggersRef.current.get(select);
        if (existing?.isConnected) return syncTrigger(select);
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.dataset.premiumSelectTrigger = "true";
        trigger.setAttribute("role", "combobox");
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        const label =
          select.getAttribute("aria-label") ||
          select
            .closest("label")
            ?.querySelector(".label")
            ?.textContent?.trim() ||
          select.name ||
          "Select an option";
        trigger.setAttribute("aria-label", label);
        select.dataset.premiumSelect = "true";
        select.dataset.originalTabIndex = String(select.tabIndex);
        select.tabIndex = -1;
        select.setAttribute("aria-hidden", "true");
        select.before(trigger);
        triggersRef.current.set(select, trigger);
        selectsRef.current.set(trigger, select);
        syncTrigger(select);
      });
    };
    const cleanupDisconnected = () => {
      triggersRef.current.forEach((trigger, select) => {
        if (select.isConnected && trigger.isConnected)
          return syncTrigger(select);
        trigger.remove();
        triggersRef.current.delete(select);
      });
    };
    enhance();
    const observer = new MutationObserver(() => {
      enhance();
      cleanupDisconnected();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const selectFromTarget = (target) => {
      const trigger = target.closest?.("button[data-premium-select-trigger]");
      return trigger ? selectsRef.current.get(trigger) : null;
    };
    const onPointerDown = (event) => {
      const select = selectFromTarget(event.target);
      if (select) {
        event.preventDefault();
        open(select);
        return;
      }
      if (activeSelectRef.current && !menuRef.current?.contains(event.target))
        close();
    };
    const onClick = (event) => {
      const select = selectFromTarget(event.target);
      if (!select) return;
      event.preventDefault();
      if (activeSelectRef.current !== select) open(select);
    };
    const onKeyDown = (event) => {
      const select = selectFromTarget(event.target);
      if (!select) {
        if (event.key === "Escape" && activeSelectRef.current)
          close({ focus: true });
        return;
      }
      if (event.key === "Tab") return close();
      if (activeSelectRef.current !== select) {
        if (
          ["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          open(select);
        }
        return;
      }
      handleKeyDown(event);
    };
    const onChange = (event) => {
      if (!event.target.matches?.("select[data-premium-select]")) return;
      if (activeSelectRef.current === event.target)
        setOptions(readOptions(event.target));
      requestAnimationFrame(() => syncTrigger(event.target));
    };
    const onInvalid = (event) => {
      if (!event.target.matches?.("select[data-premium-select]")) return;
      event.preventDefault();
      open(event.target);
    };
    const onReset = () =>
      requestAnimationFrame(() =>
        triggersRef.current.forEach((_, select) => syncTrigger(select)),
      );
    const reposition = () => activeSelectRef.current && updatePosition();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("reset", onReset, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    const enhancedTriggers = triggersRef.current;
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("reset", onReset, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      enhancedTriggers.forEach((trigger, select) => {
        trigger.remove();
        delete select.dataset.premiumSelect;
        select.tabIndex = Number(select.dataset.originalTabIndex || 0);
        delete select.dataset.originalTabIndex;
        select.removeAttribute("aria-hidden");
      });
      enhancedTriggers.clear();
    };
    // Global event handlers read the current select through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (!activeSelect) return undefined;
    const observer = new MutationObserver(() => {
      const next = readOptions(activeSelect);
      setOptions(next);
      syncTrigger(activeSelect);
      updatePosition(activeSelect);
    });
    observer.observe(activeSelect, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelect]);

  useEffect(() => {
    if (!activeSelect || !filtered.length) return;
    const safeIndex = Math.min(activeIndex, filtered.length - 1);
    const id = `${MENU_ID}-option-${filtered[safeIndex]?.index}`;
    triggerFor(activeSelect)?.setAttribute("aria-activedescendant", id);
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, activeSelect, filtered]);

  if (!activeSelect || !geometry) return null;
  return createPortal(
    <div
      ref={menuRef}
      id={MENU_ID}
      role="listbox"
      aria-label={menuLabel}
      aria-multiselectable={activeSelect.multiple || undefined}
      className={`premium-select-menu ${geometry.openUp ? "premium-select-menu-up" : ""}`}
      style={{
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        maxHeight: geometry.maxHeight,
      }}
      onKeyDown={handleKeyDown}
    >
      {searchable && (
        <div className="premium-select-search-wrap">
          <Search size={17} />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              activeIndexRef.current = 0;
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            aria-label="Search options"
          />
        </div>
      )}
      <div className="premium-select-options">
        {activeSelect.dataset.selectLoading === "true" ? (
          <div className="premium-select-empty">
            <LoaderCircle className="loading-shimmer-icon" size={17} /> Loading
            options...
          </div>
        ) : filtered.length ? (
          filtered.map((option, index) => {
            const selected = activeSelect.multiple
              ? option.value === ""
                ? activeSelect.selectedOptions.length === 0
                : option.selected
              : option.value === activeSelect.value;
            return (
              <button
                key={`${option.value}-${option.index}`}
                type="button"
                id={`${MENU_ID}-option-${option.index}`}
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={`premium-select-option ${selected ? "premium-select-option-selected" : ""} ${index === activeIndex ? "premium-select-option-active" : ""} ${option.action ? "premium-select-option-action" : ""}`}
                onMouseEnter={() => {
                  activeIndexRef.current = index;
                  setActiveIndex(index);
                }}
                onClick={() => choose(option)}
              >
                <span className="truncate">{option.label}</span>
                {selected && <Check size={18} aria-hidden="true" />}
              </button>
            );
          })
        ) : (
          <div className="premium-select-empty">No results found</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
