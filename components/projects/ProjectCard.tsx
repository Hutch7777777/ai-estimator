"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Download, Eye, Trash2, MapPin, User, Calendar, Edit } from "lucide-react";

interface Project {
  id: string;
  name: string;
  client_name: string;
  address: string;
  selected_trades: string[];
  status: string;
  created_at: string;
  excel_url?: string;
}

interface ProjectCardProps {
  project: Project;
  onView: (project: Project) => void;
  onEdit?: (id: string) => void;
  onDownload: (project: Project) => void;
  onDelete: (id: string) => void;
  mapStatusToBadgeStatus: (status: string) => "draft" | "pending" | "processing" | "complete" | "error";
  getStatusText: (status: string) => string;
  formatTradeName: (trade: string) => string;
  formatDate: (date: string) => string;
}

export function ProjectCard({
  project,
  onView,
  onEdit,
  onDownload,
  onDelete,
  mapStatusToBadgeStatus,
  getStatusText,
  formatTradeName,
  formatDate,
}: ProjectCardProps) {
  return (
    <Card className="shadow-soft hover:shadow-soft-md transition-shadow">
      <CardContent className="p-4 space-y-4">
        {/* Header: Project Name + Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{project.name}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <User className="h-3 w-3" />
              {project.client_name}
            </p>
          </div>
          <StatusBadge status={mapStatusToBadgeStatus(project.status)}>
            {getStatusText(project.status)}
          </StatusBadge>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{project.address}</span>
        </div>

        {/* Trades */}
        <div className="flex flex-wrap gap-1.5">
          {project.selected_trades?.map((trade) => (
            <Badge key={trade} variant="secondary" className="text-xs">
              {formatTradeName(trade)}
            </Badge>
          ))}
        </div>

        {/* Date */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {formatDate(project.created_at)}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(project.id)}
              className="flex-1"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onView(project)}
            className="flex-1"
          >
            <Eye className="h-4 w-4 mr-2" />
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDownload(project)}
            disabled={!project.excel_url}
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(project.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
