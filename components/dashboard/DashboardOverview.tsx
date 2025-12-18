"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Clock,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  FileText,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface ProjectStats {
  total: number;
  pending: number;
  processing: number;
  approved: number;
  won: number;
  lost: number;
}

interface RecentProject {
  id: string;
  name: string;
  client_name: string;
  status: string;
  created_at: string;
  selected_trades: string[];
}

export function DashboardOverview() {
  const [stats, setStats] = useState<ProjectStats>({
    total: 0,
    pending: 0,
    processing: 0,
    approved: 0,
    won: 0,
    lost: 0,
  });
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();

    // Subscribe to realtime changes for live stats updates
    const supabase = createClient();
    const channel = supabase
      .channel("dashboard-projects")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
        },
        () => {
          // Reload dashboard data when any project changes
          loadDashboardData();
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDashboardData = async () => {
    const supabase = createClient();

    try {
      // Fetch all projects to calculate stats
      const { data: projects, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (projects) {
        // Calculate statistics
        const statsData: ProjectStats = {
          total: projects.length,
          pending: projects.filter((p) => p.status === "pending").length,
          processing: projects.filter((p) =>
            ["extracted", "calculated", "priced"].includes(p.status || "")
          ).length,
          approved: projects.filter((p) =>
            ["approved", "sent_to_client"].includes(p.status || "")
          ).length,
          won: projects.filter((p) => p.status === "won").length,
          lost: projects.filter((p) => p.status === "lost").length,
        };

        setStats(statsData);

        // Get recent 5 projects
        setRecentProjects(projects.slice(0, 5) as RecentProject[]);
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-500",
      extracted: "bg-blue-500",
      calculated: "bg-purple-500",
      priced: "bg-orange-500",
      approved: "bg-brand-500",
      sent_to_client: "bg-teal-500",
      won: "bg-green-500",
      lost: "bg-red-500",
      on_hold: "bg-yellow-500",
    };
    return colors[status] || "bg-slate-500";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  // Calculate win rate
  const completedProjects = stats.won + stats.lost;
  const winRate = completedProjects > 0 ? Math.round((stats.won / completedProjects) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Quick Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Projects"
          value={stats.total}
          icon={FolderOpen}
          trend={{
            value: 12,
            label: "vs last month",
          }}
        />
        <StatCard
          title="In Progress"
          value={stats.pending + stats.processing}
          description={`${stats.pending} pending, ${stats.processing} processing`}
          icon={Clock}
        />
        <StatCard
          title="Approved"
          value={stats.approved}
          description="Ready to send"
          icon={CheckCircle2}
        />
        <StatCard
          title="Win Rate"
          value={`${winRate}%`}
          description={`${stats.won} won, ${stats.lost} lost`}
          icon={TrendingUp}
          trend={{
            value: winRate - 65,
            label: "vs target",
          }}
        />
      </div>

      {/* Status Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Project Status Distribution</CardTitle>
          <CardDescription>Breakdown of projects by current status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Status bars */}
            {[
              { label: "Pending", count: stats.pending, color: "bg-amber-500" },
              { label: "Processing", count: stats.processing, color: "bg-blue-500" },
              { label: "Approved", count: stats.approved, color: "bg-brand-500" },
              { label: "Won", count: stats.won, color: "bg-green-500" },
              { label: "Lost", count: stats.lost, color: "bg-red-500" },
            ].map((item) => {
              const percentage = stats.total > 0 ? (item.count / stats.total) * 100 : 0;
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">
                      {item.count} ({Math.round(percentage)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading">Recent Activity</CardTitle>
              <CardDescription>Your latest projects</CardDescription>
            </div>
            <Link href="/project?tab=past">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading recent projects...
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-sm font-medium text-foreground">No projects yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Get started by creating your first project
                </p>
                <Link href="/project/new">
                  <Button className="mt-4">
                    Create Project
                  </Button>
                </Link>
              </div>
            ) : (
              recentProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className={`h-2 w-2 rounded-full ${getStatusColor(project.status)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{project.name}</p>
                      <Badge variant="outline" className="text-xs">
                        {project.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(project.created_at)}
                      </span>
                      <span>{project.client_name}</span>
                      <span className="hidden sm:inline">
                        {project.selected_trades?.length || 0} trade(s)
                      </span>
                    </div>
                  </div>
                  <Link href={`/project/${project.id}`}>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/project/new">
              <Button variant="outline" className="w-full justify-start h-auto py-4">
                <FileText className="mr-3 h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">New Project</div>
                  <div className="text-xs text-muted-foreground">Create estimate</div>
                </div>
              </Button>
            </Link>
            <Link href="/project?tab=past">
              <Button variant="outline" className="w-full justify-start h-auto py-4">
                <FolderOpen className="mr-3 h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">Browse Projects</div>
                  <div className="text-xs text-muted-foreground">View all projects</div>
                </div>
              </Button>
            </Link>
            <Button variant="outline" className="w-full justify-start h-auto py-4" disabled>
              <DollarSign className="mr-3 h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Revenue Report</div>
                <div className="text-xs text-muted-foreground">Coming soon</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
