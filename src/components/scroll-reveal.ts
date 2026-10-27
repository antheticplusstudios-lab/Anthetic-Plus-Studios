import { useEffect } from "react";

const DIRS = ["sr-left", "sr-up", "sr-right", "sr-scale"] as const;
const TARGETS =
  "main section .grid > *, main section h2, main section .surface-card, main section dl > *";

/** Tags below-the-fold content on the current page so it slides in from varied sides on scroll. */
export function useScrollReveal(key: string) {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Tagging mutates DOM attributes React owns, so it must not run while the
    // page is still hydrating: wait for window load, then a settle delay.
    const begin = () => {
      timer = window.setTimeout(() => {
        const hero = document.querySelector("main > section:first-child, main > div:first-child");
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(TARGETS)).filter(
          (el) =>
            !hero?.contains(el) &&
            !el.parentElement?.closest(".sr") &&
            !el.classList.contains("sr"),
        );
        const io = new IntersectionObserver(
          (entries) =>
            entries.forEach((e) => {
              if (!e.isIntersecting) return;
              e.target.classList.add("sr-in");
              io.unobserve(e.target);
            }),
          { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
        );
        let i = 0;
        for (const el of nodes) {
          if (el.getBoundingClientRect().top < window.innerHeight * 0.92) continue;
          const siblings = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0;
          el.style.setProperty("--sr-delay", `${Math.min(siblings, 5) * 70}ms`);
          el.classList.add(
            "sr",
            el.tagName === "H2" ? "sr-up" : (DIRS[i++ % DIRS.length] ?? "sr-up"),
          );
          io.observe(el);
        }
        const showAll = () => nodes.forEach((node) => node.classList.add("sr-in"));
        const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onPreference = () => {
          if (preference.matches) {
            showAll();
            io.disconnect();
          }
        };
        preference.addEventListener("change", onPreference);
        cleanup = () => {
          io.disconnect();
          showAll();
          preference.removeEventListener("change", onPreference);
        };
      }, 60);
    };
    let cleanup = () => {};
    let timer = 0;
    // Lazy route chunks hydrate after window load, mutating the DOM as React
    // commits. Tag only once <main> has been structurally quiet for 300ms
    // (with a hard cap), so tagging never lands mid-hydration.
    const onLoad = () => {
      const main = document.querySelector("main");
      if (!main) {
        timer = window.setTimeout(begin, 300);
        return;
      }
      let quiet = 0;
      const mo = new MutationObserver(() => {
        window.clearTimeout(quiet);
        quiet = window.setTimeout(() => {
          mo.disconnect();
          window.clearTimeout(timer);
          begin();
        }, 300);
      });
      mo.observe(main, { childList: true, subtree: true });
      quiet = window.setTimeout(() => {
        mo.disconnect();
        window.clearTimeout(timer);
        begin();
      }, 300);
      timer = window.setTimeout(() => {
        window.clearTimeout(quiet);
        mo.disconnect();
        begin();
      }, 4000);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
      cleanup();
    };
  }, [key]);
}
