/** Copy during a user click, including browsers without the Clipboard API. */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Embedded browsers may expose the API but deny permission.
  }

  const previousFocus = document.activeElement;
  const field = document.createElement("textarea");
  try {
    field.value = text;
    field.readOnly = true;
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
};

/** LAN HTTP pages cannot use the Async Clipboard API for PNG images. */
export const canCopyPngAutomatically = (): boolean =>
  typeof window !== "undefined" && window.isSecureContext === true &&
  typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function" &&
  typeof ClipboardItem !== "undefined";
