import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/authStore";
import { getSessionLogs, getActivityLogs, getLiveLocations, type UserSession, type ActivityLog, type UserLocation } from "@/services/activity.service";
import { Activity, MapPin, LogIn, Clock, Loader2, Globe, Smartphone, Monitor } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/activity-logs" as any)({
  head: () => ({ meta: [{ title: "Activity Logs — EliteClass" }] }),
  component: ActivityLogsPage,
});

function ActivityLogsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <PageHeader title="Activity Logs" subtitle="Track user logins, actions, and live locations." />
      <Tabs defaultValue="sessions" className="mt-6">
        <TabsList>
          <TabsTrigger value="sessions">Login Sessions</TabsTrigger>
          <TabsTrigger value="activity">Activity Trail</TabsTrigger>
          <TabsTrigger value="locations">Live Locations</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions"><SessionsTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
        <TabsContent value="locations"><LocationsTab /></TabsContent>
      </Tabs>
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

  return (
    <div className="space-y-2 mt-4">
      {sessions.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No login sessions recorded yet.</CardContent></Card>
      ) : (
        sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${s.event_type === "login" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
              <LogIn className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{s.user_id.slice(0, 8)}...</p>
              <p className="text-xs text-muted-foreground">
                {s.event_type} • {s.browser} on {s.os} ({s.device_type})
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">{s.city ? `${s.city}, ${s.country}` : s.ip_address}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))
      )}
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

  return (
    <div className="space-y-2 mt-4">
      {logs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No activity logs recorded yet.</CardContent></Card>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{log.action}</p>
              <p className="text-xs text-muted-foreground truncate">
                {log.description || log.category} {log.target_name ? `→ ${log.target_name}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">{log.page_url}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))
      )}
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

  return (
    <div className="space-y-3 mt-4">
      {locations.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No users currently online with location sharing.</CardContent></Card>
      ) : (
        <>
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
                  {loc.accuracy && (
                    <p className="text-[10px] text-muted-foreground">GPS accuracy: ±{Math.round(loc.accuracy)}m</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
