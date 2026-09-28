"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function CategoryScroller({ children }) {
  const stripRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const strip = stripRef.current;
    const update = () => {
      const left = strip.scrollLeft > 2;
      const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
      setEdges((current) => current.left === left && current.right === right ? current : { left, right });
    };
    const frame = requestAnimationFrame(update);
    strip.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    for (const child of strip.children) observer.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      strip.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [children]);

  function scroll(direction) {
    const strip = stripRef.current;
    const categories = [...strip.children];
    if (!categories.length) return;
    const origin = categories[0].offsetLeft;
    const firstVisible = Math.max(0, categories.findIndex((category) => category.offsetLeft - origin + category.offsetWidth > strip.scrollLeft + 2));
    const target = Math.min(categories.length - 1, Math.max(0, firstVisible + direction * 4));
    strip.scrollTo({ left: categories[target].offsetLeft - origin, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return (
    <div className="relative mt-4 min-w-0">
      <div ref={stripRef} className="flex gap-2 overflow-x-auto px-12 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:shrink-0" aria-label="Product categories">
        {children}
      </div>
      {edges.left && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-white via-white to-transparent pr-5">
        <button type="button" className="pointer-events-auto grid size-9 place-items-center rounded-full border border-[var(--green)] bg-white text-[var(--green)] shadow-md transition hover:bg-[var(--green-soft)]" aria-label="Show previous category filters" onClick={() => scroll(-1)}>
          <ChevronLeft size={18} />
        </button>
      </div>}
      {edges.right && <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-white via-white to-transparent pl-5">
        <button type="button" className="pointer-events-auto grid size-9 place-items-center rounded-full border border-[var(--green)] bg-[var(--green)] text-white shadow-md transition hover:bg-[var(--green-dark)]" aria-label="Show next category filters" onClick={() => scroll(1)}>
          <ChevronRight size={18} />
        </button>
      </div>}
    </div>
  );
}
