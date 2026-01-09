'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MousePointer2, Plus, Move, CheckCircle } from 'lucide-react';
import KonvaDetectionCanvas from '@/components/detection-editor/KonvaDetectionCanvas';
import { calculateRealWorldMeasurements } from '@/lib/utils/coordinates';
import type {
  ExtractionPage,
  ExtractionDetection,
  DetectionClass,
  ToolMode,
} from '@/lib/types/extraction';

// =============================================================================
// Mock Data
// =============================================================================

const mockPage: ExtractionPage = {
  id: 'test-page-1',
  job_id: 'test-job',
  page_number: 1,
  image_url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200',
  original_image_url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200',
  thumbnail_url: null,
  original_width: 1200,
  original_height: 800,
  scale_ratio: 64,
  dpi: 150,
  page_type: 'elevation' as const,
  page_type_confidence: 0.95,
  elevation_name: 'front' as const,
  status: 'complete',
};

const initialMockDetections: ExtractionDetection[] = [
  {
    id: 'det-1',
    job_id: 'test-job',
    page_id: 'test-page-1',
    class: 'window' as const,
    detection_index: 0,
    confidence: 0.95,
    pixel_x: 400,
    pixel_y: 300,
    pixel_width: 120,
    pixel_height: 100,
    real_width_in: 22.5,
    real_height_in: 18.75,
    real_width_ft: 1.875,
    real_height_ft: 1.5625,
    area_sf: 2.93,
    perimeter_lf: 6.875,
    is_triangle: false,
    matched_tag: null,
    created_at: new Date().toISOString(),
    status: 'auto' as const,
    edited_by: null,
    edited_at: null,
    original_bbox: null,
  },
  {
    id: 'det-2',
    job_id: 'test-job',
    page_id: 'test-page-1',
    class: 'door' as const,
    detection_index: 1,
    confidence: 0.82,
    pixel_x: 700,
    pixel_y: 450,
    pixel_width: 80,
    pixel_height: 180,
    real_width_in: 15,
    real_height_in: 33.75,
    real_width_ft: 1.25,
    real_height_ft: 2.8125,
    area_sf: 3.52,
    perimeter_lf: 8.125,
    is_triangle: false,
    matched_tag: null,
    created_at: new Date().toISOString(),
    status: 'auto' as const,
    edited_by: null,
    edited_at: null,
    original_bbox: null,
  },
  {
    id: 'det-3',
    job_id: 'test-job',
    page_id: 'test-page-1',
    class: 'garage' as const,
    detection_index: 2,
    confidence: 0.55,
    pixel_x: 250,
    pixel_y: 500,
    pixel_width: 200,
    pixel_height: 160,
    real_width_in: 37.5,
    real_height_in: 30,
    real_width_ft: 3.125,
    real_height_ft: 2.5,
    area_sf: 7.81,
    perimeter_lf: 11.25,
    is_triangle: false,
    matched_tag: null,
    created_at: new Date().toISOString(),
    status: 'auto' as const,
    edited_by: null,
    edited_at: null,
    original_bbox: null,
  },
];

// =============================================================================
// Toolbar Button Component
// =============================================================================

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  shortcut?: string;
}

function ToolbarButton({ icon, label, isActive, onClick, shortcut }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
      }`}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {icon}
      {label}
      {shortcut && (
        <span className="text-xs opacity-60 ml-1">({shortcut})</span>
      )}
    </button>
  );
}

// =============================================================================
// Class Selector Component
// =============================================================================

interface ClassSelectorProps {
  activeClass: DetectionClass;
  onClassChange: (cls: DetectionClass) => void;
}

const DETECTION_CLASSES: { value: DetectionClass; label: string; color: string }[] = [
  { value: 'siding', label: 'Siding', color: '#10B981' },
  { value: 'window', label: 'Window', color: '#3B82F6' },
  { value: 'door', label: 'Door', color: '#F59E0B' },
  { value: 'garage', label: 'Garage', color: '#6366F1' },
  { value: 'roof', label: 'Roof', color: '#EF4444' },
  { value: 'gable', label: 'Gable', color: '#EC4899' },
];

function ClassSelector({ activeClass, onClassChange }: ClassSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-400">Class:</span>
      <select
        value={activeClass}
        onChange={(e) => onClassChange(e.target.value as DetectionClass)}
        className="bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {DETECTION_CLASSES.map((cls) => (
          <option key={cls.value} value={cls.value}>
            {cls.label}
          </option>
        ))}
      </select>
      <div
        className="w-4 h-4 rounded"
        style={{
          backgroundColor: DETECTION_CLASSES.find((c) => c.value === activeClass)?.color || '#6B7280',
        }}
      />
    </div>
  );
}

// =============================================================================
// Main Test Page
// =============================================================================

export default function TestKonvaPage() {
  // State
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [activeClass, setActiveClass] = useState<DetectionClass>('window');
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [detections, setDetections] = useState<ExtractionDetection[]>(initialMockDetections);
  const [logs, setLogs] = useState<string[]>([]);

  // Container size
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Track container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Logging helper
  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
    console.log(message);
  };

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSelectionChange = (id: string | null) => {
    setSelectedDetectionId(id);
    log(`Selection changed: ${id || 'none'}`);
  };

  const handleDetectionMove = (
    detection: ExtractionDetection,
    newPosition: { pixel_x: number; pixel_y: number }
  ) => {
    log(`Detection moved: ${detection.id} -> (${newPosition.pixel_x.toFixed(0)}, ${newPosition.pixel_y.toFixed(0)})`);

    setDetections((prev) =>
      prev.map((d) =>
        d.id === detection.id
          ? {
              ...d,
              pixel_x: newPosition.pixel_x,
              pixel_y: newPosition.pixel_y,
              status: 'edited' as const,
              edited_at: new Date().toISOString(),
            }
          : d
      )
    );
  };

  const handleDetectionResize = useCallback((
    detection: ExtractionDetection,
    newCoords: {
      pixel_x: number;
      pixel_y: number;
      pixel_width: number;
      pixel_height: number;
    }
  ) => {
    // Calculate new real-world measurements using scale_ratio
    const measurements = calculateRealWorldMeasurements(
      newCoords.pixel_width,
      newCoords.pixel_height,
      mockPage.scale_ratio || 64
    );

    setDetections((prev) =>
      prev.map((d) =>
        d.id === detection.id
          ? {
              ...d,
              pixel_x: newCoords.pixel_x,
              pixel_y: newCoords.pixel_y,
              pixel_width: newCoords.pixel_width,
              pixel_height: newCoords.pixel_height,
              // Update real-world measurements
              real_width_ft: measurements.real_width_ft,
              real_height_ft: measurements.real_height_ft,
              real_width_in: measurements.real_width_in,
              real_height_in: measurements.real_height_in,
              area_sf: measurements.area_sf,
              perimeter_lf: measurements.perimeter_lf,
              status: 'edited' as const,
              edited_at: new Date().toISOString(),
            }
          : d
      )
    );

    log(
      `Detection resized: ${detection.id} → ` +
        `(${Math.round(newCoords.pixel_x)}, ${Math.round(newCoords.pixel_y)}) ` +
        `${Math.round(newCoords.pixel_width)}×${Math.round(newCoords.pixel_height)} | ` +
        `${measurements.area_sf.toFixed(1)} SF`
    );
  }, []);

  const handleDetectionCreate = (bounds: {
    pixel_x: number;
    pixel_y: number;
    pixel_width: number;
    pixel_height: number;
    class: DetectionClass;
  }) => {
    const newId = `det-${Date.now()}`;
    log(
      `Detection created: ${newId} (${bounds.class}) at ` +
        `(${bounds.pixel_x.toFixed(0)}, ${bounds.pixel_y.toFixed(0)}) ` +
        `${bounds.pixel_width.toFixed(0)}×${bounds.pixel_height.toFixed(0)}`
    );

    const newDetection: ExtractionDetection = {
      id: newId,
      job_id: mockPage.job_id,
      page_id: mockPage.id,
      class: bounds.class,
      detection_index: detections.length,
      confidence: 1.0, // User-created
      pixel_x: bounds.pixel_x,
      pixel_y: bounds.pixel_y,
      pixel_width: bounds.pixel_width,
      pixel_height: bounds.pixel_height,
      real_width_in: null,
      real_height_in: null,
      real_width_ft: bounds.pixel_width / (mockPage.scale_ratio || 64),
      real_height_ft: bounds.pixel_height / (mockPage.scale_ratio || 64),
      area_sf: (bounds.pixel_width / (mockPage.scale_ratio || 64)) * (bounds.pixel_height / (mockPage.scale_ratio || 64)),
      perimeter_lf: null,
      is_triangle: false,
      matched_tag: null,
      created_at: new Date().toISOString(),
      status: 'edited' as const,
      edited_by: null,
      edited_at: new Date().toISOString(),
      original_bbox: null,
    };

    setDetections((prev) => [...prev, newDetection]);
    setSelectedDetectionId(newId);
    setToolMode('select'); // Switch back to select mode after creating
  };

  const handleDeleteSelected = () => {
    if (!selectedDetectionId) return;
    log(`Detection deleted: ${selectedDetectionId}`);
    setDetections((prev) =>
      prev.map((d) =>
        d.id === selectedDetectionId
          ? { ...d, status: 'deleted' as const }
          : d
      )
    );
    setSelectedDetectionId(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          setToolMode('select');
          log('Tool: Select');
          break;
        case 'd':
          e.preventDefault();
          setToolMode('create');
          log('Tool: Create');
          break;
        case 'p':
          e.preventDefault();
          setToolMode('pan');
          log('Tool: Pan');
          break;
        case 'v':
          e.preventDefault();
          setToolMode('verify');
          log('Tool: Verify');
          break;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          handleDeleteSelected();
          break;
        case 'escape':
          e.preventDefault();
          setSelectedDetectionId(null);
          log('Selection cleared');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDetectionId]);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <h1 className="text-xl font-semibold text-white">Konva Detection Editor Test</h1>
        <p className="text-sm text-gray-400 mt-1">
          Test page for the new Konva.js-based detection canvas
        </p>
      </div>

      {/* Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-4 flex-wrap">
        {/* Tool Mode Buttons */}
        <div className="flex items-center gap-2">
          <ToolbarButton
            icon={<MousePointer2 className="w-4 h-4" />}
            label="Select"
            isActive={toolMode === 'select'}
            onClick={() => setToolMode('select')}
            shortcut="S"
          />
          <ToolbarButton
            icon={<Plus className="w-4 h-4" />}
            label="Create"
            isActive={toolMode === 'create'}
            onClick={() => setToolMode('create')}
            shortcut="D"
          />
          <ToolbarButton
            icon={<Move className="w-4 h-4" />}
            label="Pan"
            isActive={toolMode === 'pan'}
            onClick={() => setToolMode('pan')}
            shortcut="P"
          />
          <ToolbarButton
            icon={<CheckCircle className="w-4 h-4" />}
            label="Verify"
            isActive={toolMode === 'verify'}
            onClick={() => setToolMode('verify')}
            shortcut="V"
          />
        </div>

        {/* Separator */}
        <div className="w-px h-8 bg-gray-600" />

        {/* Class Selector */}
        <ClassSelector activeClass={activeClass} onClassChange={setActiveClass} />

        {/* Separator */}
        <div className="w-px h-8 bg-gray-600" />

        {/* Delete Button */}
        <button
          type="button"
          onClick={handleDeleteSelected}
          disabled={!selectedDetectionId}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedDetectionId
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Delete Selected
        </button>

        {/* Detection Count */}
        <div className="ml-auto text-sm text-gray-400">
          {detections.filter((d) => d.status !== 'deleted').length} detections
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Container */}
        <div ref={containerRef} className="flex-1 relative">
          <KonvaDetectionCanvas
            page={mockPage}
            detections={detections}
            selectedDetectionId={selectedDetectionId}
            toolMode={toolMode}
            activeClass={activeClass}
            onSelectionChange={handleSelectionChange}
            onDetectionMove={handleDetectionMove}
            onDetectionResize={handleDetectionResize}
            onDetectionCreate={handleDetectionCreate}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
          />
        </div>

        {/* Log Panel */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-white">Event Log</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500">No events yet. Interact with the canvas.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono text-gray-300 bg-gray-900 px-2 py-1.5 rounded"
                  >
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-gray-700">
            <button
              type="button"
              onClick={() => setLogs([])}
              className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Clear Log
            </button>
          </div>
        </div>
      </div>

      {/* Footer Status */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
        <span>
          Mode: <span className="text-white font-medium">{toolMode}</span>
        </span>
        <span>
          Class: <span className="text-white font-medium">{activeClass}</span>
        </span>
        <span>
          Selected: <span className="text-white font-medium">{selectedDetectionId || 'none'}</span>
        </span>
        <span className="ml-auto">
          Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">S</kbd> Select,{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">D</kbd> Draw,{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">P</kbd> Pan,{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Del</kbd> Delete
        </span>
      </div>
    </div>
  );
}
