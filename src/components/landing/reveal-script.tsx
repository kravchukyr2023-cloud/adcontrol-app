"use client";
import { useEffect } from "react";

export function RevealScript() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".rv");
    if (els.length === 0) return;

    els.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 3) * 70}ms`;
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 }
    );

    els.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, []);

  return null;
}
