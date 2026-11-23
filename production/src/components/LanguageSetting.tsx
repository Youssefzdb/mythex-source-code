/**
 * The language picker in account settings: "Auto-detect" (follow the
 * browser) or one of the languages, each listed in its own name, as ChatGPT
 * lists them. The change applies at once, without a reload.
 */
import { useState } from "react";
import { DescribedSelect, type DescribedOption } from "./ui/DescribedSelect";
import { useToast } from "./ui";
import { appT, fill, useT } from "../i18n/app";
import { browserLocale, readStoredPref, type LocalePref } from "../i18n/app-locale";
import { chooseLocale } from "../i18n/choose-locale";
import { LOCALES, localeInfo } from "../i18n/locales";
import { useAuth } from "../lib/auth";
import { isNative } from "../lib/native";

export function LanguageSelect() {
  const t = useT();
  const { user } = useAuth();
  const toast = useToast();
  const [pref, setPref] = useState<LocalePref>(() => readStoredPref());

  const options: DescribedOption<LocalePref>[] = [
    {
      id: "auto",
      label: t.common.languageAuto,
      // In the app it is the phone's language, not a browser's.
      description: fill(isNative() ? t.common.languageAutoHintDevice : t.common.languageAutoHint, {
        language: localeInfo(browserLocale()).label,
      }),
    },
    ...LOCALES.map((l) => ({ id: l.code, label: l.label })),
  ];

  return (
    <DescribedSelect<LocalePref>
      value={pref}
      options={options}
      ariaLabel={t.common.language}
      align="right"
      wide
      onChange={(next) => {
        setPref(next);
        // The screen switches first; saving to the account follows. If that
        // save fails the choice still holds on this device, so say so.
        chooseLocale(next, { signedIn: Boolean(user) }).then(
          () => toast("success", appT().common.languageChanged),
          () => toast("error", appT().common.somethingWentWrong),
        );
      }}
    />
  );
}
