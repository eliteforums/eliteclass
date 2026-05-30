import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NotificationCompose } from "@/components/dashboard/notifications/NotificationCompose";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import { getSessionLogs, getActivityLogs, getLiveLocations, type UserSession, type ActivityLog, type UserLocation } from "@/services/activity.service";
import { Activity, MapPin, LogIn, Clock, Loader2, Bell, Send } from "lucide-react";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({
    meta: [{ title: "Notifications & Activity — EliteClass" }],
  }),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <div className="space-y-6">
        <Tabs defaultValue="send">
          <TabsList>
            <TabsTrigger value="send" className="gap-1.5"><Send className="h-3.5 w-3.5" />Send Notification</TabsTrigger>
            <TabsTrigger value="sessions" className="gap-1.5"><LogIn className="h-3.5 w-3.5" />Login Logs</TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Activity Trail</TabsTrigger>
            <TabsTrigger value="locations" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />Live Locations</TabsTrigger>
          </TabsList>
          <TabsContent value="send"><NotificationCompose /></TabsContent>
          <TabsContent value="sessions"><SessionsTab /></TabsContent>
          <TabsContent value="activity"><ActivityTab /></TabsContent>
          <TabsContent value="locations"><LocationsTab /></TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}

function SessionsTab() {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.institute_id) return;
    setLoading(true);
    getSessionLogs(user.institute_id, { limit: 50 }).then((res) => {
      if (res.success && res.data) setSessions(res.data);
      setLoading(false);
    });
  }, [user?.institute_id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (sessions.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground">No login sessions recorded yet. Run the activity tracking SQL migration first.</CardContent></Card>;

  return (
    <div className="space-y-2 mt-4">
      {sessions.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${s.event_type === "login" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
            <LogIn className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{s.user_id.slice(0, 8)}...</p>
            <p className="text-xs text-muted-foreground">{s.event_type} • {s.browser} on {s.os} ({s.device_type})</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{s.city ? `${s.city}, ${s.country}` : s.ip_address || "Unknown"}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityTab() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.institute_id) return;
    setLoading(true);
    getActivityLogs(user.institute_id, { limit: 50 }).then((res) => {
      if (res.success && res.data) setLogs(res.data);
      setLoading(false);
    });
  }, [user?.institute_id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (logs.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground">No activity logs recorded yet.</CardContent></Card>;

  return (
    <div className="space-y-2 mt-4">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">{log.action}</p>
            <p className="text-xs text-muted-foreground truncate">{log.description || log.category} {log.target_name ? `→ ${log.target_name}` : ""}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{log.page_url}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LocationsTab() {
  const { user } = useAuthStore();
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.institute_id) return;
    setLoading(true);
    getLiveLocations(user.institute_id).then((res) => {
      if (res.success && res.data) setLocations(res.data);
      setLoading(false);
    });
  }, [user?.institute_id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (locations.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground">No users currently online with location sharing.</CardContent></Card>;

  return (
    <div className="space-y-3 mt-4">
      <p className="text-sm text-muted-foreground">{locations.length} user(s) currently online</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <Card key={loc.id}>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium">{loc.user_id.slice(0, 8)}...</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{loc.city || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Last seen: {new Date(loc.last_seen_at).toLocaleTimeString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
