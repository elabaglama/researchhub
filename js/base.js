/**
 * App base path helper.
 * Supports both:
 *   https://hubforopportunities-six.vercel.app/
 *   https://www.teramap.co/researchhub
 *   https://www.teramap.co/researchhub/
 *
 * An inline bootstrap in each HTML <head> sets <base href="/researchhub/">
 * before any relative assets load. This file keeps window.__APP_BASE__ in sync.
 */
(function () {
  const path = location.pathname || "/";
  const underHub =
    path === "/researchhub" ||
    path === "/researchhub/" ||
    path.startsWith("/researchhub/");
  const basePath = underHub ? "/researchhub" : "";
  window.__APP_BASE__ = basePath;

  if (underHub && !document.querySelector("base")) {
    const b = document.createElement("base");
    b.href = "/researchhub/";
    document.head.insertBefore(b, document.head.firstChild);
  }

  window.appUrl = function appUrl(path) {
    const p = String(path || "");
    if (/^https?:\/\//i.test(p) || p.startsWith("data:") || p.startsWith("mailto:")) {
      return p;
    }
    if (p.startsWith("/")) return basePath + p;
    return p;
  };
})();
