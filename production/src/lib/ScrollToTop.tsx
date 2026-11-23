/**
 * A new page starts at its top. Without this, a link in the footer of a long
 * page opened the next page scrolled to its footer too (only some page shells
 * scrolled up themselves). Back and forward keep the browser's position, and
 * a #section is left to the page that owns the section.
 */
import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (type === "POP" || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash, type]);
  return null;
}
