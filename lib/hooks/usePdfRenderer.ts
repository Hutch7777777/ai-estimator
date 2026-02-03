'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

interface UsePdfRendererProps {
  pdfUrl: string | null;
  pageNumber: number;  // 1-indexed (matches PDF.js convention)
  dpi: number;         // Usually 200 from extraction pipeline
  imageWidth?: number | null;   // Actual image width in pixels (from loaded image)
  imageHeight?: number | null;  // Actual image height in pixels (from loaded image)
}

interface UsePdfRendererResult {
  pdfCanvas: HTMLCanvasElement | null;
  isLoading: boolean;
  error: Error | null;
  pdfDimensions: { width: number; height: number } | null;  // In image-equivalent pixels
  renderAtZoom: (zoom: number) => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for rendering PDF pages using PDF.js with dynamic zoom-based re-rendering.
 *
 * Key design decisions:
 * - Calculates baseScale from actual image dimensions (imageWidth / pdfWidth) for exact match
 * - Falls back to dpi / 72 if image dimensions not available
 * - Re-renders at higher resolution when zooming for crisp text
 * - Uses double-buffering to prevent flash during zoom transitions
 * - Coordinates remain in "image pixel space" - no conversion needed
 *
 * @param pdfUrl - URL to the PDF file (Supabase storage URL)
 * @param pageNumber - 1-indexed page number
 * @param dpi - DPI of the original extraction (usually 200)
 * @param imageWidth - Actual image width from the loaded rasterized image
 * @param imageHeight - Actual image height from the loaded rasterized image
 */
export function usePdfRenderer({
  pdfUrl,
  pageNumber,
  dpi,
  imageWidth,
  imageHeight,
}: UsePdfRendererProps): UsePdfRendererResult {
  // PDF.js document and page references
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPage, setPdfPage] = useState<any>(null);

  // Output state - displayCanvas is what gets shown (swapped after render completes)
  const [displayCanvas, setDisplayCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculated dimensions and scale
  const [baseScale, setBaseScale] = useState<number>((dpi || 200) / 72);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | null>(null);

  // Refs for render management
  const renderTaskRef = useRef<any>(null);

  // Double-buffer: two canvases - one displays while the other renders
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRef = useRef<'A' | 'B'>('A');
  const currentRenderZoomRef = useRef<number>(0);

  // =========================================================================
  // Initialize canvases for double-buffering
  // =========================================================================

  useEffect(() => {
    if (!canvasARef.current) {
      canvasARef.current = document.createElement('canvas');
    }
    if (!canvasBRef.current) {
      canvasBRef.current = document.createElement('canvas');
    }
  }, []);

  // =========================================================================
  // Load PDF document
  // =========================================================================

  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      setPdfPage(null);
      setDisplayCanvas(null);
      setPdfDimensions(null);
      setError(null);
      setBaseScale((dpi || 200) / 72);
      currentRenderZoomRef.current = 0;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        // Dynamic import of PDF.js
        const pdfjsLib = await import('pdfjs-dist');

        // Configure worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        console.log('[usePdfRenderer] Loading PDF from:', pdfUrl);

        const doc = await pdfjsLib.getDocument({
          url: pdfUrl,
          // Enable range requests for better performance with large PDFs
          disableRange: false,
          disableStream: false,
        }).promise;

        if (cancelled) return;

        console.log('[usePdfRenderer] PDF loaded, pages:', doc.numPages);
        setPdfDoc(doc);
      } catch (err) {
        if (cancelled) return;
        console.error('[usePdfRenderer] Failed to load PDF:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, dpi]);

  // =========================================================================
  // Load specific page and calculate baseScale from actual image dimensions
  // =========================================================================

  useEffect(() => {
    if (!pdfDoc || !pageNumber) return;

    let cancelled = false;

    (async () => {
      try {
        console.log('[usePdfRenderer] Loading page:', pageNumber);

        // Validate page number
        if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
          throw new Error(`Invalid page number ${pageNumber}. PDF has ${pdfDoc.numPages} pages.`);
        }

        const page = await pdfDoc.getPage(pageNumber);

        if (cancelled) return;

        setPdfPage(page);

        // Get PDF page dimensions at scale 1 (in points, 72 DPI)
        const viewport = page.getViewport({ scale: 1 });
        const pdfWidth = viewport.width;
        const pdfHeight = viewport.height;

        // Calculate baseScale to match image pixel space
        let calculatedScale: number;

        if (imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0) {
          // Use actual image dimensions for exact match
          calculatedScale = imageWidth / pdfWidth;
          console.log('[usePdfRenderer] baseScale from image:', `${imageWidth} / ${pdfWidth} = ${calculatedScale.toFixed(4)}`);
          console.log('[usePdfRenderer] Image dimensions:', imageWidth, 'x', imageHeight);
        } else {
          // Fall back to DPI-based calculation
          calculatedScale = (dpi || 200) / 72;
          console.log('[usePdfRenderer] baseScale from DPI:', `${dpi} / 72 = ${calculatedScale.toFixed(4)}`);
        }

        setBaseScale(calculatedScale);

        // Calculate dimensions in image-equivalent pixels
        const dimensions = {
          width: Math.round(pdfWidth * calculatedScale),
          height: Math.round(pdfHeight * calculatedScale)
        };

        console.log('[usePdfRenderer] PDF dimensions at baseScale:', dimensions);
        setPdfDimensions(dimensions);

        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[usePdfRenderer] Failed to load page:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, imageWidth, imageHeight, dpi]);

  // =========================================================================
  // Render at specific zoom level with double-buffering
  // =========================================================================

  const renderAtZoom = useCallback(async (zoom: number) => {
    if (!pdfPage || !canvasARef.current || !canvasBRef.current) {
      console.log('[usePdfRenderer] Cannot render - no page or canvases');
      return;
    }

    // Calculate render zoom (integer ceiling for sharpness)
    const renderZoom = Math.max(1, Math.ceil(zoom));

    // Skip if already rendered at this zoom level
    if (renderZoom === currentRenderZoomRef.current && displayCanvas) {
      return;
    }

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {
        // Ignore cancel errors
      }
      renderTaskRef.current = null;
    }

    // Choose the inactive canvas for rendering (double-buffering)
    const renderCanvas = activeCanvasRef.current === 'A'
      ? canvasBRef.current
      : canvasARef.current;

    const totalScale = baseScale * renderZoom;
    const viewport = pdfPage.getViewport({ scale: totalScale });

    console.log('[usePdfRenderer] Rendering to back buffer at zoom:', zoom.toFixed(2), 'multiplier:', renderZoom, 'totalScale:', totalScale.toFixed(4));

    // Update canvas dimensions
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;

    const ctx = renderCanvas.getContext('2d');
    if (!ctx) {
      console.error('[usePdfRenderer] Failed to get 2D context');
      return;
    }

    // Clear canvas before rendering
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    // Start render
    renderTaskRef.current = pdfPage.render({
      canvasContext: ctx,
      viewport: viewport,
    });

    try {
      await renderTaskRef.current.promise;

      // Render complete - swap canvases (double-buffer swap)
      currentRenderZoomRef.current = renderZoom;
      activeCanvasRef.current = activeCanvasRef.current === 'A' ? 'B' : 'A';
      setDisplayCanvas(renderCanvas);

      console.log('[usePdfRenderer] Render complete, swapped to canvas', activeCanvasRef.current);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[usePdfRenderer] Render error:', err);
      }
    }
  }, [pdfPage, baseScale, displayCanvas]);

  // =========================================================================
  // Initial render when page is ready
  // =========================================================================

  useEffect(() => {
    if (pdfPage && pdfDimensions && currentRenderZoomRef.current === 0) {
      renderAtZoom(1);
    }
  }, [pdfPage, pdfDimensions, renderAtZoom]);

  return {
    pdfCanvas: displayCanvas,
    isLoading,
    error,
    pdfDimensions,
    renderAtZoom,
  };
}
