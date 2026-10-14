// Decorative indicator: the surrounding control/status supplies its label.
export default function LoadingShimmer({ size = 20, className = '', style, ...props }) {
  return <span {...props} aria-hidden="true" className={`loading-shimmer-icon ${className}`}
    style={{ width: size, height: size, ...style }} />;
}

export function LoadingPlaceholder({ label = 'Loading…', className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined} aria-busy={label ? true : undefined} aria-hidden={!label || undefined}>
      {label && <span className="sr-only">{label}</span>}
      <div aria-hidden="true" className="space-y-3">
        <div className="loading-shimmer h-5 w-2/3 rounded-md" />
        <div className="loading-shimmer h-4 w-full rounded-md" />
        <div className="loading-shimmer h-4 w-4/5 rounded-md" />
      </div>
    </div>
  );
}
