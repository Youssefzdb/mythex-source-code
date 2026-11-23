import { appLocale } from "../i18n/app";
import { localeInfo } from "../i18n/locales";

/** Minimal typings for the Web Speech API (Chromium + Safari). */
export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

/**
 * The language to dictate in: the app's language, so an Arabic UI dictates
 * Arabic. When the browser speaks a regional form of that same language
 * (en-GB, pt-BR, ar-EG), that finer tag is kept for better recognition.
 */
export function dictationLang(): string {
  const tag = localeInfo(appLocale()).tag;
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  const base = (s: string) => s.toLowerCase().split("-")[0];
  if (nav && base(nav) === base(tag) && (tag.length <= 2 || nav.toLowerCase() === tag.toLowerCase())) return nav;
  return tag;
}
