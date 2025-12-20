"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface PageThumbnailsProps {
  pdfDocument: any;
  currentPage: number;
  totalPages: number;
  onPageSelect: (page: number) => void;
}

export function PageThumbnails({
  pdfDocument,
  currentPage,
  totalPages,
  onPageSelect,
}: PageThumbnailsProps) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Generate thumbnail for a specific page
  const generateThumbnail = async (pageNumber: number) => {
    if (!pdfDocument || thumbnails[pageNumber] || loadingPages.has(pageNumber)) return;

    setLoadingPages((prev) => new Set(prev).add(pageNumber));

    try {
      const page = await pdfDocument.getPage(pageNumber);
      const scale = 0.2;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport, canvas }).promise;

      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      setThumbnails((prev) => ({ ...prev, [pageNumber]: dataUrl }));
    } catch (error) {
      console.error(`Error generating thumbnail for page ${pageNumber}:`, error);
    } finally {
      setLoadingPages((prev) => {
        const next = new Set(prev);
        next.delete(pageNumber);
        return next;
      });
    }
  };

  // Generate thumbnails progressively
  useEffect(() => {
    if (!pdfDocument || totalPages === 0) return;

    const generateAll = async () => {
      for (let i = 1; i <= Math.min(totalPages, 50); i++) {
        await generateThumbnail(i);
      }
    };

    generateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDocument, totalPages]);

  // Scroll current page thumbnail into view
  useEffect(() => {
    const thumbnailEl = thumbnailRefs.current[currentPage];
    if (thumbnailEl && containerRef.current) {
      thumbnailEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentPage]);

  if (totalPages <= 1) return null;

  return (
    <div className="w-full bg-gray-100 border-t border-gray-200">
      <div
        ref={containerRef}
        className="flex gap-2 p-2 overflow-x-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            ref={(el) => {
              thumbnailRefs.current[pageNum] = el;
            }}
            onClick={() => onPageSelect(pageNum)}
            className={cn(
              "flex-shrink-0 flex flex-col items-center gap-1 p-1 rounded transition-all",
              "hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500",
              currentPage === pageNum ? "bg-blue-100 ring-2 ring-blue-500" : "bg-white"
            )}
          >
            <div
              className={cn(
                "relative w-16 h-20 bg-white border rounded shadow-sm overflow-hidden",
                currentPage === pageNum ? "border-blue-500" : "border-gray-300"
              )}
            >
              {thumbnails[pageNum] ? (
                <img
                  src={thumbnails[pageNum]}
                  alt={`Page ${pageNum}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              )}
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                currentPage === pageNum ? "text-blue-600" : "text-gray-600"
              )}
            >
              {pageNum}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
