import type { Metadata } from 'next';
// Direct file import (not the barrel): this is a server page, and the barrel
// drags in modules without 'use client' directives.
import { CADMarkupStep } from '@/components/cad-markup/CADMarkupStep';

export const metadata: Metadata = {
  title: 'PDF Markup',
};

/**
 * Standalone markup tool (the former /project "PDF Markups" tab).
 * Clearly labeled: its output is export-only today and does NOT feed the
 * estimation pipeline — pending the Phase-5 wire-or-delete decision
 * (CONFIRMED_WORK_PLAN.md, Flow C).
 */
export default function CadMarkupToolPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-4 rounded-lg border border-ink/20 bg-ink/5 px-4 py-3 text-sm">
        <p className="font-medium">Standalone tool</p>
        <p className="text-muted-foreground">
          Markups made here export to CSV/Excel/JSON only — they do not flow into estimates or
          takeoffs.
        </p>
      </div>
      <CADMarkupStep />
    </div>
  );
}
