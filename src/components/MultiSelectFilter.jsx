"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export default function MultiSelectFilter({ label, placeholder = label, clearLabel, values = [], options = [], onChange, triggerClassName = "field", openTriggerClassName = "" }) {
  const [open, setOpen] = useState(false);
  const selected = new Set(values.map(String));
  const displayLabel = values.length ? `${label} (${values.length})` : placeholder;

  function toggle(value) {
    const normalized = String(value);
    onChange(selected.has(normalized)
      ? values.filter((item) => String(item) !== normalized)
      : [...values, value]);
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={`${triggerClassName} flex items-center justify-between gap-3 text-left ${open ? openTriggerClassName : ""}`}
          aria-label={label}
          aria-expanded={open}
        >
          <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
          {open ? <ChevronUp className="shrink-0" size={17} /> : <ChevronDown className="shrink-0" size={17} />}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          avoidCollisions
          className="z-[120] max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-2 shadow-xl"
        >
          <DropdownMenu.Item
            className="cursor-pointer select-none rounded-lg px-3 py-2 text-sm font-bold outline-none hover:bg-slate-50 focus:bg-slate-50"
            onSelect={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            {clearLabel || `All ${label.toLowerCase()}`}
          </DropdownMenu.Item>
          {options.map((option) => {
            const value = typeof option === "object" ? option.value : option;
            const optionLabel = typeof option === "object" ? option.label : option;
            return (
              <DropdownMenu.CheckboxItem
                key={String(value)}
                checked={selected.has(String(value))}
                onCheckedChange={() => toggle(value)}
                onSelect={(event) => event.preventDefault()}
                className="relative cursor-pointer select-none rounded-lg py-2 pl-3 pr-9 text-sm font-bold outline-none hover:bg-slate-50 focus:bg-slate-50 data-[state=checked]:bg-[var(--green-soft)] data-[state=checked]:text-[var(--green)]"
              >
                {optionLabel}
                <DropdownMenu.ItemIndicator className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Check size={15} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
