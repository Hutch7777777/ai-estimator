"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  Calculator,
  Ruler,
  Building2,
  CornerDownRight,
} from "lucide-react";
import {
  getCadExtractionSummary,
  CadHoverMeasurements,
  CadExtraction,
} from "@/lib/supabase/cadExtractions";
import { CalloutClassificationPanel } from "./CalloutClassificationPanel";
import { getProjectExtractionJobs } from "@/lib/supabase/extractionQueries";
import { getPhase4Data, calculateLinearElements } from "@/lib/api/extractionApi";
import type { Phase4Data } from "@/lib/types/extraction";

interface CadDataPanelProps {
  projectId: string;
}

export function CadDataPanel({ projectId }: CadDataPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [hover, setHover] = useState<CadHoverMeasurements | null>(null);
  const [extraction, setExtraction] = useState<CadExtraction | null>(null);
  const [calloutCount, setCalloutCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [hasData, setHasData] = useState(false);

  // Phase 4 Enhanced Data state
  const [phase4Data, setPhase4Data] = useState<Phase4Data | null>(null);
  const [phase4Loading, setPhase4Loading] = useState(false);
  const [phase4Expanded, setPhase4Expanded] = useState(true);
  const [extractionJobId, setExtractionJobId] = useState<string | null>(null);

  useEffect(() => {
    loadCadData();
    loadPhase4Data();
  }, [projectId]);

  const loadCadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await getCadExtractionSummary(projectId);

      if (fetchError) {
        console.error('CadDataPanel: Error loading CAD data:', fetchError);
        setError(fetchError);
        setHasData(false);
      } else if (data?.extraction) {
        setHasData(true);
        setExtraction(data.extraction);
        setHover(data.hover);
        setCalloutCount(data.calloutCount);
        setUnknownCount(data.unknownCallouts);
      } else {
        setHasData(false);
      }
    } catch (err) {
      console.error('CadDataPanel: Exception loading CAD data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load CAD data');
      setHasData(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClassificationChange = () => {
    // Reload summary when classifications change
    loadCadData();
  };

  // Load Phase 4 enhanced data from extraction-api
  const loadPhase4Data = async () => {
    try {
      // First, find extraction jobs for this project
      const jobs = await getProjectExtractionJobs(projectId);

      if (jobs.length === 0) {
        // No extraction jobs for this project
        setExtractionJobId(null);
        setPhase4Data(null);
        return;
      }

      // Use the most recent completed job
      const completedJob = jobs.find(j => j.status === 'complete') || jobs[0];
      setExtractionJobId(completedJob.id);

      // Try to get Phase 4 data (cached or calculate)
      const data = await getPhase4Data(completedJob.id);
      setPhase4Data(data);
    } catch (err) {
      console.error('CadDataPanel: Error loading Phase 4 data:', err);
      // Don't set error state - Phase 4 is optional enhancement
    }
  };

  // Manually trigger Phase 4 calculation
  const handleCalculatePhase4 = async () => {
    if (!extractionJobId) return;

    setPhase4Loading(true);
    try {
      const data = await calculateLinearElements(extractionJobId);
      setPhase4Data(data);
    } catch (err) {
      console.error('CadDataPanel: Error calculating Phase 4 data:', err);
    } finally {
      setPhase4Loading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading CAD data...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-red-600">
          Failed to load CAD data. <button onClick={loadCadData} className="underline hover:no-underline">Retry</button>
        </CardContent>
      </Card>
    );
  }

  if (!hasData) {
    return null; // Don't show panel if no CAD data
  }

  return (
    <div className="space-y-4">
      {/* HOVER Measurements Card */}
      <Card>
        <CardHeader
          className="p-4 cursor-pointer flex flex-row items-center justify-between"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-green-600" />
            <CardTitle className="text-sm font-medium">
              CAD Extraction Data
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {calloutCount} callouts
            </Badge>
            {unknownCount > 0 && (
              <Badge
                variant="outline"
                className="bg-amber-100 text-amber-800 border-amber-200"
              >
                {unknownCount} unclassified
              </Badge>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </CardHeader>

        {expanded && hover && (
          <CardContent className="p-4 pt-0">
            {/* HOVER Measurements Summary */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Facade Area:</span>
                <span className="font-medium">
                  {Number(hover.facade_total_sqft).toLocaleString()} SF
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Siding:</span>
                <span className="font-medium">
                  {Number(hover.net_siding_sqft).toLocaleString()} SF
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Windows:</span>
                <span className="font-medium">
                  {hover.openings_windows_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Doors:</span>
                <span className="font-medium">
                  {hover.openings_doors_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outside Corners:</span>
                <span className="font-medium">
                  {hover.outside_corners_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Inside Corners:</span>
                <span className="font-medium">
                  {hover.inside_corners_count}
                </span>
              </div>
              {hover.siding_product && (
                <div className="col-span-2 flex justify-between">
                  <span className="text-muted-foreground">Siding:</span>
                  <span
                    className="font-medium truncate max-w-[200px]"
                    title={hover.siding_product}
                  >
                    {hover.siding_product}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Phase 4 Enhanced Data Card */}
      {extractionJobId && (
        <Card>
          <CardHeader
            className="p-4 cursor-pointer flex flex-row items-center justify-between"
            onClick={() => setPhase4Expanded(!phase4Expanded)}
          >
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm font-medium">
                Enhanced Calculations
              </CardTitle>
              {phase4Data?.wall_heights && (
                <Badge
                  variant="outline"
                  className={
                    phase4Data.wall_heights.source === 'ocr'
                      ? "bg-green-100 text-green-800 border-green-200"
                      : "bg-amber-100 text-amber-800 border-amber-200"
                  }
                >
                  {phase4Data.wall_heights.source === 'ocr' ? 'OCR' : 'Estimated'}
                </Badge>
              )}
            </div>
            {phase4Expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </CardHeader>

          {phase4Expanded && (
            <CardContent className="p-4 pt-0 space-y-4">
              {phase4Loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Calculating...</span>
                </div>
              ) : phase4Data ? (
                <>
                  {/* Wall Heights Section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <Building2 className="h-3 w-3" />
                      Wall Heights
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm pl-5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">1st Floor:</span>
                        <span className="font-medium">
                          {phase4Data.wall_heights.first_floor_ft.toFixed(1)} ft
                        </span>
                      </div>
                      {phase4Data.wall_heights.second_floor_ft !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">2nd Floor:</span>
                          <span className="font-medium">
                            {phase4Data.wall_heights.second_floor_ft.toFixed(1)} ft
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Height:</span>
                        <span className="font-medium">
                          {phase4Data.wall_heights.total_wall_height_ft.toFixed(1)} ft
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stories:</span>
                        <span className="font-medium">
                          {phase4Data.wall_heights.story_count}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Corner Calculations Section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <CornerDownRight className="h-3 w-3" />
                      Corner Details
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm pl-5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Outside Corners:</span>
                        <span className="font-medium">
                          {phase4Data.corners.outside_corners_count} ({phase4Data.corners.outside_corners_lf.toFixed(0)} LF)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Inside Corners:</span>
                        <span className="font-medium">
                          {phase4Data.corners.inside_corners_count} ({phase4Data.corners.inside_corners_lf.toFixed(0)} LF)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Corner Posts:</span>
                        <span className="font-medium">
                          {phase4Data.corners.corner_posts_needed} pcs
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">J-Channel:</span>
                        <span className="font-medium">
                          {phase4Data.corners.j_channel_pieces_needed} pcs
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Perimeter Elements Section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <Ruler className="h-3 w-3" />
                      Perimeter Elements
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm pl-5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Building Perimeter:</span>
                        <span className="font-medium">
                          {phase4Data.perimeter.building_perimeter_lf.toFixed(0)} LF
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Starter Strip:</span>
                        <span className="font-medium">
                          {phase4Data.perimeter.starter_strip_lf.toFixed(0)} LF ({phase4Data.perimeter.starter_strip_pieces} pcs)
                        </span>
                      </div>
                      {phase4Data.perimeter.water_table_lf > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Water Table:</span>
                          <span className="font-medium">
                            {phase4Data.perimeter.water_table_lf.toFixed(0)} LF
                          </span>
                        </div>
                      )}
                      {phase4Data.perimeter.band_board_lf > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Band Board:</span>
                          <span className="font-medium">
                            {phase4Data.perimeter.band_board_lf.toFixed(0)} LF
                          </span>
                        </div>
                      )}
                      {phase4Data.perimeter.frieze_board_lf > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Frieze Board:</span>
                          <span className="font-medium">
                            {phase4Data.perimeter.frieze_board_lf.toFixed(0)} LF
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trim Totals (if available) */}
                  {phase4Data.trim_totals && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Trim Perimeters
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm pl-5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Window Perimeter:</span>
                          <span className="font-medium">
                            {phase4Data.trim_totals.window_perimeter_lf.toFixed(0)} LF
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Door Perimeter:</span>
                          <span className="font-medium">
                            {phase4Data.trim_totals.door_perimeter_lf.toFixed(0)} LF
                          </span>
                        </div>
                        {phase4Data.trim_totals.gable_rake_lf > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Gable Rake:</span>
                            <span className="font-medium">
                              {phase4Data.trim_totals.gable_rake_lf.toFixed(0)} LF
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Enhanced corner and perimeter calculations not yet generated.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCalculatePhase4}
                    disabled={phase4Loading}
                  >
                    {phase4Loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Calculating...
                      </>
                    ) : (
                      <>
                        <Calculator className="h-4 w-4 mr-2" />
                        Calculate Now
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Material Classifications Panel */}
      {expanded && extraction && (
        <CalloutClassificationPanel
          extractionId={extraction.id}
          onClassificationChange={handleClassificationChange}
        />
      )}
    </div>
  );
}
