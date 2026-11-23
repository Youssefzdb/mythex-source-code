import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/useI18n";

/** The landing prompt's typewriter: "Ask Mythex to build…" and the words it cycles (shorter on phones). */
export function useHeroTypewriter() {
  const { m } = useI18n();
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setMobile(mq.matches);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return {
    prefix: m.home.typewriterPrefix,
    words: (mobile ? m.home.typewriterWordsMobile : m.home.typewriterWords).split("|"),
  };
}
