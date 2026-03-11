import jsPDF from 'jspdf';

/**
 * Attempts to load the JF OpenHuninn Chinese font into a jsPDF document.
 * Tries multiple path variants for compatibility with different deployment bases.
 *
 * @returns The font name to use: 'OpenHuninn' if loaded, 'helvetica' as fallback.
 */
export async function loadChineseFontToDoc(doc: jsPDF): Promise<string> {
    const pathsToTry = [
        '/schedule/fonts/jf-openhuninn-2.1.ttf',
        '/fonts/jf-openhuninn-2.1.ttf',
    ];

    for (const path of pathsToTry) {
        try {
            const res = await fetch(path);
            const contentType = res.headers.get('content-type');
            // Reject HTML responses (e.g. 404 pages served as HTML)
            if (!res.ok || (contentType && contentType.includes('text/html'))) continue;

            const blob = await res.blob();
            const base64data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            if (!base64data.includes('base64,')) continue;

            const content = base64data.split('base64,')[1];
            doc.addFileToVFS('jf-openhuninn-2.1.ttf', content);
            doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'normal');
            doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'bold');
            doc.addFont('jf-openhuninn-2.1.ttf', 'OpenHuninn', 'italic');
            doc.setFont('OpenHuninn');
            return 'OpenHuninn';
        } catch (e) {
            // Try next path
        }
    }

    // Fallback to built-in font
    return 'helvetica';
}
