"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({
  className = "field",
  visibilityLabel = "password",
  id,
  disabled,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  const action = `${visible ? "Hide" : "Show"} ${visibilityLabel}`;

  return (
    <span className="relative block">
      <input
        {...props}
        id={inputId}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={`${className} !pr-12`}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-[var(--muted)] hover:text-[var(--green)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green)] disabled:opacity-50"
        onClick={() => setVisible((current) => !current)}
        aria-label={action}
        aria-controls={inputId}
        title={action}
        disabled={disabled}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}
