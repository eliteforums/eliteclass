import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Activity,
  UserX,
  Maximize,
  Copy
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getExamAttemptViolations } from '../../services/exam.service';

interface LiveExamMonitoringProps {
  examId: string;
}

interface ActiveStudent {
  attempt_id: string;
  student_name: string;
  admission_no: string;
  status: string;
  last_active_at: string;
  violation_count: number;
  last_violation_at: string | null;
  auto_submit_reason: string | null;
  is_locked: boolean;
}

interface ViolationLog {
  id: string;
  student_name: string;
  violation_type: string;
  timestamp: string;
  metadata: any;
}

export function LiveExamMonitoring({ examId }: LiveExamMonitoringProps) {
  const [activeStudents, setActiveStudents] = useState<ActiveStudent[]>([]);
  const [recentViolations, setRecentViolations] = useState<ViolationLog[]>([]);
  const [stats, setStats] = useState({
    online: 0,
    submitted: 0,
    violations: 0,
  });

  const fetchInitialData = useCallback(async () => {
    // Fetch active attempts via the shared summary API
    const { data: attempts } = await getExamAttemptViolations(examId);

    if (attempts) {
      const formatted = attempts.map((a: any) => ({
        attempt_id: a.attempt_id,
        student_name: a.student_name || 'Unknown',
        admission_no: a.admission_no || '',
        status: a.status,
        last_active_at: a.last_violation_at || a.submitted_at || new Date().toISOString(),
        violation_count: a.violations || 0,
        last_violation_at: a.last_violation_at,
        auto_submit_reason: a.auto_submit_reason,
        is_locked: ['submitted', 'auto_submitted', 'graded'].includes(a.status),
      }));
      setActiveStudents(formatted);
      
      const onlineCount = formatted.filter(s => 
        s.status === 'in_progress' && 
        new Date().getTime() - new Date(s.last_active_at).getTime() < 60000
      ).length;
      
      const submittedCount = formatted.filter(s => 
        ['submitted', 'auto_submitted', 'graded'].includes(s.status)
      ).length;

      setStats(prev => ({
        ...prev,
        online: onlineCount,
        submitted: submittedCount,
      }));
    }

    // Fetch recent violations
    const { data: violations } = await supabase
      .from('test_violations')
      .select(`
        *,
        attempt:exam_attempts(
          student:students(
            user:users(name)
          )
        )
      `)
      .eq('attempt.exam_id', examId)
      .order('timestamp', { ascending: false })
      .limit(20);

    if (violations) {
      setRecentViolations(violations.map((v: any) => ({
        id: v.id,
        student_name: v.attempt?.student?.user?.name || 'Unknown',
        violation_type: v.violation_type,
        timestamp: v.timestamp,
        metadata: v.metadata,
      })));
      
      setStats(prev => ({
        ...prev,
        violations: violations.length,
      }));
    }
  }, [examId]);

  useEffect(() => {
    fetchInitialData();

    // Subscribe to realtime violations
    const violationSubscription = supabase
      .channel(`exam-violations-${examId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'test_violations',
        },
        async (payload) => {
          // Fetch student name for the violation
          const { data: attemptData } = await supabase
            .from('exam_attempts')
            .select('student:students(user:users(name))')
            .eq('id', payload.new.attempt_id)
            .single();

          if (attemptData) {
            const newViolation = {
              id: payload.new.id,
              student_name: (attemptData as any).student?.user?.name || 'Unknown',
              violation_type: payload.new.violation_type,
              timestamp: payload.new.timestamp,
              metadata: payload.new.metadata,
            };

            setRecentViolations(prev => [newViolation, ...prev].slice(0, 20));
            setStats(prev => ({ ...prev, violations: prev.violations + 1 }));
            toast.error(`Violation: ${newViolation.student_name} - ${newViolation.violation_type}`);
          }
        }
      )
      .subscribe();

    // Subscribe to attempt changes (status, activity)
    const attemptSubscription = supabase
      .channel(`exam-attempts-${examId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_attempts',
          filter: `exam_id=eq.${examId}`,
        },
        () => {
          fetchInitialData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(violationSubscription);
      supabase.removeChannel(attemptSubscription);
    };
  }, [examId, fetchInitialData]);

  const getViolationIcon = (type: string) => {
    switch (type) {
      case 'fullscreen_exit': return <Maximize className="h-4 w-4" />;
      case 'tab_switch': return <Copy className="h-4 w-4" />;
      case 'window_blur': return <UserX className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Students</p>
                <h3 className="text-2xl font-bold">{stats.online}</h3>
              </div>
              <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Submissions</p>
                <h3 className="text-2xl font-bold">{stats.submitted}</h3>
              </div>
              <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Violations</p>
                <h3 className="text-2xl font-bold">{stats.violations}</h3>
              </div>
              <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Students List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" /> Active Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {activeStudents.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No active attempts found</p>
                ) : (
                  activeStudents.map((student) => {
                    const isOnline = new Date().getTime() - new Date(student.last_active_at).getTime() < 60000;
                    
                    return (
                      <div key={student.attempt_id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-2 w-2 rounded-full",
                            isOnline ? "bg-green-500 animate-pulse" : "bg-gray-300"
                          )} />
                          <div>
                            <p className="font-medium text-sm">{student.student_name}</p>
                            <p className="text-xs text-muted-foreground">{student.admission_no}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <Badge variant={student.status === 'in_progress' ? 'outline' : 'secondary'}>
                              {student.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex flex-col items-end min-w-[80px]">
                            <span className={cn(
                              "text-xs font-bold",
                              student.violation_count > 0 ? "text-red-600" : "text-green-600"
                            )}>
                              {student.violation_count} Violations
                            </span>
                            {student.auto_submit_reason && (
                              <span className="text-[10px] text-muted-foreground max-w-[180px] truncate">
                                {student.auto_submit_reason}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-2 w-2" />
                              {student.last_violation_at
                                ? format(new Date(student.last_violation_at), 'HH:mm:ss')
                                : format(new Date(student.last_active_at), 'HH:mm:ss')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Realtime Violation Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" /> Live Violation Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {recentViolations.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No violations recorded</p>
                ) : (
                  recentViolations.map((violation) => (
                    <div key={violation.id} className="flex gap-3 p-2 border-b last:border-0 pb-3">
                      <div className="mt-1 p-1.5 bg-red-50 rounded text-red-600">
                        {getViolationIcon(violation.violation_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{violation.student_name}</p>
                        <p className="text-xs text-red-600 font-medium">
                          {violation.violation_type.replace('_', ' ').toUpperCase()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(violation.timestamp), 'MMM d, HH:mm:ss')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}