// OCR fallback for scanned PDFs (spec §3): page image -> tesseract.js -> text.
// Lazy-loaded; if the OCR engine/lang data cannot load (offline, blocked CDN)
// it fails safely with a friendly message instead of hanging the import.
export async function renderPageToCanvas(pdf: any, pageNumber: number, scale = 2): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser canvas is unavailable, so OCR cannot run.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (pct: number) => void,
): Promise<string> {
  let worker: any = null;
  try {
    const mod: any = await import('tesseract.js');
    worker = await mod.createWorker('eng', undefined, {
      logger: (m: any) => { if (m?.status === 'recognizing text' && typeof m.progress === 'number') onProgress?.(m.progress); },
    });
  } catch {
    throw new Error('OCR engine could not be loaded (it needs a one-time download). Check your connection and use “Try again”, or use a text-based PDF / Excel file instead.');
  }
  try {
    const { data } = await worker.recognize(canvas);
    return (data?.text || '') as string;
  } catch {
    throw new Error('OCR failed on this page (image unreadable). Try a higher-quality scan.');
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
}
