"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Download } from "lucide-react";
import {
  Polygon,
  CountMarker,
  LinearMeasurement,
} from "./types";
import { useMemo } from "react";

interface MarkupLegendProps {
  polygons: Polygon[];
  markers: CountMarker[];
  measurements: LinearMeasurement[];
  onDeletePolygon: (id: string) => void;
  onDeleteMarker: (id: string) => void;
  onDeleteMeasurement: (id: string) => void;
  onExportSummary: () => void;
  hideCard?: boolean;
}

interface SummaryGroup {
  key: string;
  label: string;
  color: string;
  areas: Array<{ id: string; value: number }>;
  totalArea: number;
  counts: Array<{ id: string; value: number }>;
  totalCount: number;
  measurements: Array<{ id: string; value: number }>;
  totalLength: number;
}

export function MarkupLegend({
  polygons,
  markers,
  measurements,
  onDeletePolygon,
  onDeleteMarker,
  onDeleteMeasurement,
  onExportSummary,
  hideCard = false,
}: MarkupLegendProps) {
  // Helper to get material key and label
  const getMaterialInfo = (material: { trade: string; category: string; productName?: string; color: string }) => {
    const key = `${material.trade}:${material.category}`;
    const label = material.productName || material.category || material.trade || "Unknown";
    return { key, label, color: material.color };
  };

  // Group items by material (trade + category)
  const summaryGroups = useMemo(() => {
    const groups = new Map<string, SummaryGroup>();

    // Add polygons
    polygons.forEach((polygon) => {
      if (!polygon.isComplete) return;
      const { key, label, color } = getMaterialInfo(polygon.material);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          color,
          areas: [],
          totalArea: 0,
          counts: [],
          totalCount: 0,
          measurements: [],
          totalLength: 0,
        });
      }
      const group = groups.get(key)!;
      group.areas.push({ id: polygon.id, value: polygon.area });
      group.totalArea += polygon.area;
    });

    // Add markers
    markers.forEach((marker) => {
      const { key, label, color } = getMaterialInfo(marker.material);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          color,
          areas: [],
          totalArea: 0,
          counts: [],
          totalCount: 0,
          measurements: [],
          totalLength: 0,
        });
      }
      const group = groups.get(key)!;
      group.counts.push({ id: marker.id, value: marker.count });
      group.totalCount += marker.count;
    });

    // Add measurements
    measurements.forEach((measurement) => {
      const { key, label, color } = getMaterialInfo(measurement.material);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          color,
          areas: [],
          totalArea: 0,
          counts: [],
          totalCount: 0,
          measurements: [],
          totalLength: 0,
        });
      }
      const group = groups.get(key)!;
      group.measurements.push({ id: measurement.id, value: measurement.lengthFeet });
      group.totalLength += measurement.lengthFeet;
    });

    return Array.from(groups.values());
  }, [polygons, markers, measurements]);

  const hasItems = summaryGroups.length > 0;

  // Content to render (shared between Card and hideCard modes)
  const content = (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {!hasItems ? (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">No markups yet</p>
          <p className="text-xs mt-2">Use the tools to add areas, counts, or measurements</p>
        </div>
      ) : (
        <>
          {/* Summary Table */}
          <div className="space-y-3">
              {summaryGroups.map((group) => (
                <div key={group.key} className="border rounded-lg overflow-hidden">
                  {/* Group Header */}
                  <div
                    className="px-3 py-2 font-medium text-sm text-white flex items-center gap-2"
                    style={{ backgroundColor: group.color }}
                  >
                    <div
                      className="w-3 h-3 rounded border border-white"
                      style={{ backgroundColor: group.color }}
                    />
                    <span>{group.label}</span>
                  </div>

                  {/* Group Content */}
                  <div className="bg-white">
                    {/* Areas */}
                    {group.areas.length > 0 && (
                      <div className="border-b last:border-b-0">
                        <div className="px-3 py-2 bg-gray-50 font-medium text-xs flex justify-between items-center">
                          <span>Areas</span>
                          <span className="text-[#00cc6a]">{group.totalArea.toFixed(2)} SF</span>
                        </div>
                        <div className="divide-y">
                          {group.areas.map((area, index) => (
                            <div
                              key={area.id}
                              className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-gray-50"
                            >
                              <span className="text-muted-foreground">Area {index + 1}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{area.value.toFixed(2)} SF</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={() => onDeletePolygon(area.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Counts */}
                    {group.counts.length > 0 && (
                      <div className="border-b last:border-b-0">
                        <div className="px-3 py-2 bg-gray-50 font-medium text-xs flex justify-between items-center">
                          <span>Counts</span>
                          <span className="text-[#00cc6a]">{group.totalCount} EA</span>
                        </div>
                        <div className="divide-y">
                          {group.counts.map((count, index) => (
                            <div
                              key={count.id}
                              className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-gray-50"
                            >
                              <span className="text-muted-foreground">Marker {index + 1}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{count.value} EA</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={() => onDeleteMarker(count.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Measurements */}
                    {group.measurements.length > 0 && (
                      <div>
                        <div className="px-3 py-2 bg-gray-50 font-medium text-xs flex justify-between items-center">
                          <span>Measurements</span>
                          <span className="text-[#00cc6a]">
                            {group.totalLength.toFixed(2)} LF
                          </span>
                        </div>
                        <div className="divide-y">
                          {group.measurements.map((measurement, index) => (
                            <div
                              key={measurement.id}
                              className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-gray-50"
                            >
                              <span className="text-muted-foreground">Line {index + 1}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{measurement.value.toFixed(2)} LF</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={() => onDeleteMeasurement(measurement.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Export Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onExportSummary}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Summary
            </Button>
          </>
        )}
      </div>
  );

  if (hideCard) {
    return content;
  }

  return (
    <Card className="h-full shadow-soft rounded-xl flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-lg">Takeoff Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">{content}</CardContent>
    </Card>
  );
}
