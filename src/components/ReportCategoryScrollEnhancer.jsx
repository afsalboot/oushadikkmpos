"use client";

import { useEffect } from "react";

function arrowButton(direction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `report-category-arrow report-category-arrow-${direction}`;
  button.setAttribute(
    "aria-label",
    direction === "left"
      ? "Show previous report categories"
      : "Show next report categories",
  );
  return button;
}

export default function ReportCategoryScrollEnhancer() {
  useEffect(() => {
    const strip = document.querySelector("nav.report-controls");
    if (!strip) return;

    const left = arrowButton("left"),
      right = arrowButton("right");
    document.body.append(left, right);

    const update = () => {
      const rect = strip.getBoundingClientRect(),
        outsideViewport = rect.bottom <= 0 || rect.top >= window.innerHeight,
        atStart = strip.scrollLeft <= 2,
        atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2,
        top = rect.top + (rect.height - 38) / 2;
      left.style.left = `${Math.max(8, rect.left)}px`;
      right.style.left = `${Math.max(8, rect.right - 38)}px`;
      left.style.top = right.style.top = `${top}px`;
      left.hidden = outsideViewport || atStart;
      right.hidden = outsideViewport || atEnd;
    };
    const scrollCategories = (direction) => {
      const categories = [...strip.children].filter(
        (category) => category instanceof HTMLElement,
      );
      if (!categories.length) return;

      const origin = categories[0].offsetLeft,
        current = strip.scrollLeft,
        firstVisible = Math.max(
          0,
          categories.findIndex(
            (category) =>
              category.offsetLeft - origin + category.offsetWidth > current + 2,
          ),
        ),
        targetIndex = Math.min(
          categories.length - 1,
          Math.max(0, firstVisible + direction * 4),
        );
      strip.scrollTo({
        left: categories[targetIndex].offsetLeft - origin,
        behavior: "smooth",
      });
    };
    const goLeft = () => scrollCategories(-1),
      goRight = () => scrollCategories(1);

    left.addEventListener("click", goLeft);
    right.addEventListener("click", goRight);
    strip.addEventListener("scroll", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const resizeObserver = new ResizeObserver(update),
      mutationObserver = new MutationObserver(update);
    resizeObserver.observe(strip);
    mutationObserver.observe(strip, { childList: true });
    update();

    return () => {
      left.removeEventListener("click", goLeft);
      right.removeEventListener("click", goRight);
      strip.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      left.remove();
      right.remove();
    };
  }, []);

  return null;
}
