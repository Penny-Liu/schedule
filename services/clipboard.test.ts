import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

afterEach(() => vi.unstubAllGlobals());

const mockBrowser = (clipboard: unknown, copyResult = true) => {
  const field = { value: "", readOnly: false, style: { cssText: "" }, focus: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), remove: vi.fn() };
  const execCommand = vi.fn(() => copyResult);
  vi.stubGlobal("navigator", { clipboard });
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("document", {
    activeElement: null,
    createElement: vi.fn(() => field),
    body: { appendChild: vi.fn() },
    execCommand,
  });
  return { field, execCommand };
};

describe("copyTextToClipboard", () => {
  it("copies exact LINE text using the Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { execCommand } = mockBrowser({ writeText });
    expect(await copyTextToClipboard("👉 11/11 (三) 42%\n🎯 ")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("👉 11/11 (三) 42%\n🎯 ");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back without throwing when the Clipboard API is absent", async () => {
    const { field, execCommand } = mockBrowser(undefined);
    expect(await copyTextToClipboard("LINE\n文字")).toBe(true);
    expect(field.value).toBe("LINE\n文字");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(field.remove).toHaveBeenCalled();
  });

  it("falls back when permission is denied", async () => {
    const { execCommand } = mockBrowser({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    expect(await copyTextToClipboard("文字")).toBe(true);
    expect(execCommand).toHaveBeenCalled();
  });

  it("reports failure and cleans up when fallback is blocked", async () => {
    const { field, execCommand } = mockBrowser(undefined);
    execCommand.mockImplementation(() => { throw new Error("blocked"); });
    expect(await copyTextToClipboard("文字")).toBe(false);
    expect(field.remove).toHaveBeenCalled();
  });
});

describe("PNG clipboard availability", () => {
  it("uses the native image-copy instructions on LAN HTTP even if an API stub exists", async () => {
    const { canCopyPngAutomatically } = await import("./clipboard");
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn() } });
    vi.stubGlobal("ClipboardItem", class {});
    expect(canCopyPngAutomatically()).toBe(false);
  });
  it("requires a secure context and the actual image-writing APIs", async () => {
    const { canCopyPngAutomatically } = await import("./clipboard");
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn() } });
    vi.stubGlobal("ClipboardItem", class {});
    expect(canCopyPngAutomatically()).toBe(true);
    vi.stubGlobal("navigator", { clipboard: undefined });
    expect(canCopyPngAutomatically()).toBe(false);
  });
});
