import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Loader2, Eye, MousePointerClick, Users, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(340, 65%, 55%)",
  "hsl(45, 80%, 50%)",
  "hsl(270, 60%, 55%)",
  "hsl(180, 50%, 45%)",
];

type PageViewRow = { page_path: string; user_role: string | null; created_at: string; user_id: string };
type ClickEventRow = { page_path: string; element_tag: string; element_text: string | null; element_id: string | null; user_role: string | null; created_at: string; user_id: string };

export default function AdminAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const [pageViews, setPageViews] = useState<PageViewRow[]>([]);
  const [clickEvents, setClickEvents] = useState<ClickEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user, timeRange]);

  const getDateFilter = () => {
    const now = new Date();
    const days = timeRange === "1d" ? 1 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const from = new Date(now.getTime() - days * 86400000).toISOString();
    return from;
  };

  const fetchData = async () => {
    setLoading(true);
    const from = getDateFilter();

    const [pvRes, ceRes] = await Promise.all([
      supabase.from("page_views").select("page_path, user_role, created_at, user_id").gte("created_at", from).order("created_at", { ascending: false }).limit(1000),
      supabase.from("click_events").select("page_path, element_tag, element_text, element_id, user_role, created_at, user_id").gte("created_at", from).order("created_at", { ascending: false }).limit(1000),
    ]);

    setPageViews((pvRes.data || []) as PageViewRow[]);
    setClickEvents((ceRes.data || []) as ClickEventRow[]);
    setLoading(false);
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  // Aggregate page views by path
  const pvByPage = pageViews.reduce<Record<string, number>>((acc, pv) => {
    acc[pv.page_path] = (acc[pv.page_path] || 0) + 1;
    return acc;
  }, {});
  const pvChartData = Object.entries(pvByPage)
    .map(([path, count]) => ({ path: path.length > 25 ? "..." + path.slice(-22) : path, fullPath: path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Aggregate clicks by element text
  const clicksByElement = clickEvents.reduce<Record<string, number>>((acc, ce) => {
    const key = ce.element_text || ce.element_id || `<${ce.element_tag}>`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const clickChartData = Object.entries(clicksByElement)
    .map(([name, count]) => ({ name: name.length > 30 ? name.slice(0, 27) + "..." : name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Role distribution
  const roleBreakdown = pageViews.reduce<Record<string, number>>((acc, pv) => {
    const r = pv.user_role || "unknown";
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});
  const rolePieData = Object.entries(roleBreakdown).map(([name, value]) => ({ name, value }));

  // Unique users
  const uniqueUsers = new Set(pageViews.map((p) => p.user_id)).size;

  // Clicks by page
  const clicksByPage = clickEvents.reduce<Record<string, number>>((acc, ce) => {
    acc[ce.page_path] = (acc[ce.page_path] || 0) + 1;
    return acc;
  }, {});
  const clicksByPageData = Object.entries(clicksByPage)
    .map(([path, count]) => ({ path: path.length > 25 ? "..." + path.slice(-22) : path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Admin Research Portal</h1>
            <p className="text-sm text-muted-foreground">User interaction analytics for research & iteration</p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10"><Eye className="h-5 w-5 text-primary" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pageViews.length}</p>
                    <p className="text-xs text-muted-foreground">Page Views</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/20"><MousePointerClick className="h-5 w-5 text-accent" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{clickEvents.length}</p>
                    <p className="text-xs text-muted-foreground">Click Events</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10"><Users className="h-5 w-5 text-blue-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{uniqueUsers}</p>
                    <p className="text-xs text-muted-foreground">Unique Users</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{Object.keys(pvByPage).length}</p>
                    <p className="text-xs text-muted-foreground">Unique Pages</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="pages" className="space-y-4">
              <TabsList>
                <TabsTrigger value="pages">Page Views</TabsTrigger>
                <TabsTrigger value="clicks">Click Events</TabsTrigger>
                <TabsTrigger value="breakdown">Role Breakdown</TabsTrigger>
              </TabsList>

              {/* Page Views Tab */}
              <TabsContent value="pages" className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Most Visited Pages</CardTitle></CardHeader>
                  <CardContent>
                    {pvChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={pvChartData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis dataKey="path" type="category" width={150} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">No page view data yet</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Page Views Table</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Page</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(pvByPage).sort(([, a], [, b]) => b - a).map(([path, count]) => (
                          <TableRow key={path}>
                            <TableCell className="font-mono text-xs">{path}</TableCell>
                            <TableCell className="text-right"><Badge variant="secondary">{count}</Badge></TableCell>
                          </TableRow>
                        ))}
                        {Object.keys(pvByPage).length === 0 && (
                          <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Click Events Tab */}
              <TabsContent value="clicks" className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Most Clicked Elements</CardTitle></CardHeader>
                  <CardContent>
                    {clickChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={clickChartData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis dataKey="name" type="category" width={180} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                          <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">No click data yet</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Clicks by Page</CardTitle></CardHeader>
                  <CardContent>
                    {clicksByPageData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={clicksByPageData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis dataKey="path" type="category" width={150} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                          <Bar dataKey="count" fill="hsl(210, 70%, 55%)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">No click data yet</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Recent Clicks</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Element</TableHead>
                          <TableHead>Page</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clickEvents.slice(0, 50).map((ce, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <span className="font-mono text-xs">&lt;{ce.element_tag}&gt;</span>
                              {ce.element_text && <span className="ml-2 text-xs text-muted-foreground">{ce.element_text.slice(0, 40)}</span>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ce.page_path}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{ce.user_role}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(ce.created_at).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                        {clickEvents.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Role Breakdown Tab */}
              <TabsContent value="breakdown" className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Page Views by Role</CardTitle></CardHeader>
                  <CardContent className="flex justify-center">
                    {rolePieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={rolePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {rolePieData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8">No data</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
