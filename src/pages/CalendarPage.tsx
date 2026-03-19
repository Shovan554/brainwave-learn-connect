import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, BookOpen, Clock, CalendarIcon,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek, isToday, parseISO,
} from "date-fns";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string | null;
  color: string;
  type: "personal";
}

interface AssignmentEvent {
  id: string;
  title: string;
  course_title: string;
  course_id: string;
  due_date: string;
  points: number | null;
  type: "assignment";
}

type CalendarItem = CalendarEvent | AssignmentEvent;

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", class: "bg-primary" },
  { value: "green", label: "Green", class: "bg-[hsl(var(--success))]" },
  { value: "red", label: "Red", class: "bg-destructive" },
  { value: "purple", label: "Purple", class: "bg-accent" },
  { value: "orange", label: "Orange", class: "bg-[hsl(var(--warning))]" },
];

function getEventColorClass(color: string) {
  const map: Record<string, string> = {
    blue: "bg-primary text-primary-foreground",
    green: "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
    red: "bg-destructive text-destructive-foreground",
    purple: "bg-accent text-accent-foreground",
    orange: "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]",
  };
  return map[color] || map.blue;
}

export default function CalendarPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [assignments, setAssignments] = useState<AssignmentEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", event_time: "", color: "blue" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const [eventsRes, assignmentsRes] = await Promise.all([
      supabase.from("calendar_events").select("*").eq("user_id", user!.id),
      fetchAssignments(),
    ]);

    if (eventsRes.data) {
      setEvents(eventsRes.data.map((e: any) => ({ ...e, type: "personal" as const })));
    }
    setLoading(false);
  };

  const fetchAssignments = async () => {
    if (role === "student") {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id, courses(title)")
        .eq("student_id", user!.id);

      if (!enrollments?.length) { setAssignments([]); return; }

      const courseIds = enrollments.map((e: any) => e.course_id);
      const courseMap: Record<string, string> = {};
      enrollments.forEach((e: any) => { if (e.courses) courseMap[e.course_id] = e.courses.title; });

      const { data: assgn } = await supabase
        .from("assignments")
        .select("id, title, course_id, due_date, points")
        .in("course_id", courseIds)
        .eq("is_published", true)
        .not("due_date", "is", null);

      setAssignments(
        (assgn || []).map((a: any) => ({
          ...a,
          course_title: courseMap[a.course_id] || "Course",
          type: "assignment" as const,
        }))
      );
    } else {
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("teacher_id", user!.id);

      if (!courses?.length) { setAssignments([]); return; }

      const courseIds = courses.map((c: any) => c.id);
      const courseMap: Record<string, string> = {};
      courses.forEach((c: any) => { courseMap[c.id] = c.title; });

      const { data: assgn } = await supabase
        .from("assignments")
        .select("id, title, course_id, due_date, points")
        .in("course_id", courseIds)
        .not("due_date", "is", null);

      setAssignments(
        (assgn || []).map((a: any) => ({
          ...a,
          course_title: courseMap[a.course_id] || "Course",
          type: "assignment" as const,
        }))
      );
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getItemsForDate = (date: Date): CalendarItem[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const personalEvents = events.filter((e) => e.event_date === dateStr);
    const assignmentEvents = assignments.filter((a) => a.due_date && format(parseISO(a.due_date), "yyyy-MM-dd") === dateStr);
    return [...personalEvents, ...assignmentEvents];
  };

  const selectedDateItems = selectedDate ? getItemsForDate(selectedDate) : [];

  const handleAddEvent = async () => {
    if (!selectedDate || !newEvent.title.trim()) return;
    const { error } = await supabase.from("calendar_events").insert({
      user_id: user!.id,
      title: newEvent.title.trim(),
      description: newEvent.description.trim(),
      event_date: format(selectedDate, "yyyy-MM-dd"),
      event_time: newEvent.event_time || null,
      color: newEvent.color,
    });
    if (error) {
      toast({ title: "Error", description: "Failed to add event", variant: "destructive" });
    } else {
      toast({ title: "Event added!" });
      setShowAddDialog(false);
      setNewEvent({ title: "", description: "", event_time: "", color: "blue" });
      fetchData();
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    await supabase.from("calendar_events").delete().eq("id", eventId);
    toast({ title: "Event deleted" });
    fetchData();
  };

  const upcomingItems = useMemo(() => {
    const today = new Date();
    const allItems: (CalendarItem & { sortDate: Date })[] = [
      ...events.map((e) => ({ ...e, sortDate: parseISO(e.event_date) })),
      ...assignments.map((a) => ({ ...a, sortDate: parseISO(a.due_date) })),
    ];
    return allItems
      .filter((i) => i.sortDate >= new Date(today.toDateString()))
      .sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())
      .slice(0, 8);
  }, [events, assignments]);

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
        <p className="text-muted-foreground">Track assignments and personal events</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Calendar */}
        <Card className="xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-lg">{format(currentMonth, "MMMM yyyy")}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 border-t border-l border-border">
              {calendarDays.map((day) => {
                const items = getItemsForDate(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`min-h-[90px] border-r border-b border-border p-1.5 text-left transition-colors hover:bg-muted/50 ${
                      !isCurrentMonth ? "opacity-40" : ""
                    } ${isSelected ? "bg-primary/10 ring-1 ring-primary" : ""} ${
                      isToday(day) ? "bg-accent/10" : ""
                    }`}
                  >
                    <span className={`text-xs font-medium ${isToday(day) ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "text-foreground"}`}>
                      {format(day, "d")}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {items.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            item.type === "assignment"
                              ? "bg-primary/20 text-primary"
                              : getEventColorClass((item as CalendarEvent).color)
                          }`}
                        >
                          {item.title}
                        </div>
                      ))}
                      {items.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{items.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Selected date details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                {selectedDate ? format(selectedDate, "EEEE, MMM d") : "Select a date"}
                {selectedDate && (
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddDialog(true); }}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDateItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events on this day</p>
              ) : (
                <div className="space-y-2">
                  {selectedDateItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          {item.type === "assignment" ? (
                            <div className="flex items-center gap-1 mt-1">
                              <BookOpen className="h-3 w-3 text-primary" />
                              <span className="text-xs text-muted-foreground">{(item as AssignmentEvent).course_title}</span>
                              {(item as AssignmentEvent).points && (
                                <Badge variant="secondary" className="text-[10px] h-4">{(item as AssignmentEvent).points} pts</Badge>
                              )}
                            </div>
                          ) : (
                            <>
                              {(item as CalendarEvent).event_time && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{(item as CalendarEvent).event_time}</span>
                                </div>
                              )}
                              {(item as CalendarEvent).description && (
                                <p className="text-xs text-muted-foreground mt-1">{(item as CalendarEvent).description}</p>
                              )}
                            </>
                          )}
                        </div>
                        {item.type === "personal" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleDeleteEvent(item.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing upcoming</p>
              ) : (
                <div className="space-y-2">
                  {upcomingItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${item.type === "assignment" ? "bg-primary" : getEventColorClass((item as any).color || "blue").split(" ")[0]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format((item as any).sortDate, "MMM d")}
                          {item.type === "assignment" && ` · ${(item as AssignmentEvent).course_title}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Legend</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary/20 border border-primary/30" />
                  <span className="text-xs text-muted-foreground">Assignment due</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary" />
                  <span className="text-xs text-muted-foreground">Personal event</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Event Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Event — {selectedDate && format(selectedDate, "MMM d, yyyy")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Event title" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
            <Textarea placeholder="Description (optional)" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} rows={2} />
            <Input type="time" value={newEvent.event_time} onChange={(e) => setNewEvent({ ...newEvent, event_time: e.target.value })} />
            <Select value={newEvent.color} onValueChange={(v) => setNewEvent({ ...newEvent, color: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${c.class}`} />
                      {c.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={handleAddEvent} disabled={!newEvent.title.trim()}>
              Add Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
