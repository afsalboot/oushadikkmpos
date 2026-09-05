export default function OushadhiLogo({
  compact = false,
  showPos = true,
  tone = "brand",
  className = "",
}) {
  const label = showPos ? "Oushadhi POS" : "Oushadhi";

  return (
    <span
      className={`oushadhi-logo oushadhi-logo--${tone}${compact ? " oushadhi-logo--compact" : ""}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={label}
    >
      <span className="oushadhi-logo__word" aria-hidden="true">
        {compact ? "O" : "Oushadhi"}
      </span>
      {showPos && !compact ? (
        <span className="oushadhi-logo__pos" aria-hidden="true">POS</span>
      ) : null}
    </span>
  );
}
