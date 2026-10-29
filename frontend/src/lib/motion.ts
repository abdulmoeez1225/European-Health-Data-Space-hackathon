/** Smooth scrolling unless the user asked for reduced motion (CSS cannot override an explicit behavior). */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
