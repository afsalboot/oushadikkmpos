import { TriangleAlert } from "lucide-react";

export default function ExpiredStockWarning({ product }) {
  if (!product?.expired) return null;
  const expiry = product.nearestExpiredExpiry;
  const label = expiry
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(expiry))
    : null;
  return (
    <span className="expired-stock-warning">
      <span className="flex items-center gap-1 font-extrabold">
        <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />
        Expired stock
      </span>
      {label && <span className="block">Expired {label}</span>}
    </span>
  );
}
