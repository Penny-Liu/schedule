import type jsPDF from 'jspdf';

const FONT_FILE_NAME = 'jf-openhuninn-2.1.ttf';
const FONT_FAMILY = 'OpenHuninn';
let cachedFontBase64: Promise<string> | null = null;

const arrayBufferToBase64 = (buffer: ArrayBuffer): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            if (typeof result !== 'string' || !result.includes('base64,')) {
                reject(new Error('中文字型無法轉換為 PDF 可用格式'));
                return;
            }
            resolve(result.slice(result.indexOf('base64,') + 7));
        };
        reader.onerror = () => reject(reader.error ?? new Error('中文字型讀取失敗'));
        reader.readAsDataURL(new Blob([buffer], { type: 'font/ttf' }));
    });

const isTrueTypeOrOpenType = (buffer: ArrayBuffer) => {
    if (buffer.byteLength < 4) return false;
    const bytes = new Uint8Array(buffer, 0, 4);
    const signature = String.fromCharCode(...bytes);
    return (
        (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) ||
        signature === 'OTTO' ||
        signature === 'true'
    );
};

const fetchChineseFont = async (): Promise<string> => {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const pathsToTry = Array.from(new Set([
        `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}fonts/${FONT_FILE_NAME}`,
        `/schedule/fonts/${FONT_FILE_NAME}`,
        `/fonts/${FONT_FILE_NAME}`,
    ]));

    const failures: string[] = [];
    for (const path of pathsToTry) {
        try {
            const response = await fetch(path, { cache: 'force-cache' });
            if (!response.ok) {
                failures.push(`${path} (${response.status})`);
                continue;
            }

            const buffer = await response.arrayBuffer();
            if (!isTrueTypeOrOpenType(buffer)) {
                failures.push(`${path} (不是有效字型)`);
                continue;
            }
            return await arrayBufferToBase64(buffer);
        } catch (error) {
            failures.push(`${path} (${error instanceof Error ? error.message : '載入失敗'})`);
        }
    }

    throw new Error(`無法載入 PDF 中文字型：${failures.join('、')}`);
};

/**
 * Loads and embeds the Chinese font required by every PDF export.
 * It deliberately throws instead of falling back to Helvetica, because jsPDF's
 * built-in fonts cannot render Chinese and would create a corrupted-looking PDF.
 */
export async function loadChineseFontToDoc(doc: jsPDF): Promise<string> {
    if (!cachedFontBase64) {
        cachedFontBase64 = fetchChineseFont().catch((error) => {
            cachedFontBase64 = null;
            throw error;
        });
    }

    const content = await cachedFontBase64;
    doc.addFileToVFS(FONT_FILE_NAME, content);
    doc.addFont(FONT_FILE_NAME, FONT_FAMILY, 'normal');
    doc.addFont(FONT_FILE_NAME, FONT_FAMILY, 'bold');
    doc.addFont(FONT_FILE_NAME, FONT_FAMILY, 'italic');
    doc.addFont(FONT_FILE_NAME, FONT_FAMILY, 'bolditalic');
    doc.setFont(FONT_FAMILY, 'normal');

    if (!doc.getFontList()[FONT_FAMILY]?.includes('normal')) {
        throw new Error('PDF 中文字型註冊失敗，已停止匯出以避免亂碼');
    }

    return FONT_FAMILY;
}
