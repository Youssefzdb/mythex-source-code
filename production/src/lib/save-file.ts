/**
 * Save bytes as a file on the person's device, under `name`.
 *
 * The bytes go out as a generic binary. Given a PDF, an image or text, Safari
 * on the iPhone shows it in the tab rather than saving it — whatever the
 * `download` attribute or the server's "attachment" say — and our Download
 * button just opened the PDF. It cannot show a generic binary, so it asks
 * "Do you want to download …?" and keeps the name, extension and all.
 * Checked in iOS Safari; desktop browsers save either way.
 */
export function saveFile(data: Blob, name: string): void {
  const href = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  // In the document: Firefox ignores a click on a detached link.
  document.body.append(a);
  a.click();
  a.remove();
  // Not at once: Safari reads the link after the click returns.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
