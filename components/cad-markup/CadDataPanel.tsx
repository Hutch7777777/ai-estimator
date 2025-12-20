"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
} from "lucide-react";
import {
  getCadExtractionSummary,
  CadHoverMeasurements,
  CadExtraction,
} from "@/lib/supabase/cadExtractions";
import { CalloutClassificationPanel } from "./CalloutClassificationPanel";

interface CadDataPanelProps {
  projectId: string;
}

export function CadDataPanel({ projectId }: CadDataPanelProps) {
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [hover, setHover] = useState<CadHoverMeasurements | null>(null);
  const [extraction, setExtraction] = useState<CadExtraction | null>(null);
  const [calloutCount, setCalloutCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    loadCadData();
  }, [projectId]);

  const loadCadData = async () => {
    setLoading(true);
    const { data } = await getCadExtractionSummary(projectId);

    if (data?.extraction) {
      setHasData(true);
      setExtraction(data.extraction);
      setHover(data.hover);
      setCalloutCount(data.calloutCount);
      setUnknownCount(data.unknownCallouts);
    } else {
      setHasData(false);
    }
    setLoading(false);
  };

  const handleClassificationChange = () => {
    // Reload summary when classifications change
    loadCadData();
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
