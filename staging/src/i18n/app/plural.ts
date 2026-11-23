/**
 * Messages that change with a count. English needs two forms; Arabic needs
 * six, Japanese one. Each language fills the CLDR categories it uses and
 * `other` is always there as the fallback.
 *
 *   files: plural({ one: "{n} file", other: "{n} files" })
 *   pl(t.shell.files, 3)  → "3 files"
 */
export type Plural = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

/** Marks a message as plural so its type allows every category. */
export function plural(forms: Plural): Plural {
  return forms;
}
