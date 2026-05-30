// ---------------------------------------------------------------------------
// BatchMemberList — Member list showing name and avatar for initiating DMs
//
// Displays all students enrolled in the user's batches. Clicking a member
// initiates a DM conversation via getOrCreateConversation.
// Shows error when recipient has no common batch.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { Users, Loader2, Search, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  getOrCreateConversation,
  validateCommonBatch,
  type DMConversation,
} from "@/services/dm.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface BatchMember {
  user_id: string;
  name: string;
  avatar_url: string | null;
  batch_name: string;
}

interface BatchMemberListProps {
  onStartConversation: (conversation: DMConversation) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function BatchMemberList({ onStartConversation }: BatchMemberListProps) {
  const { user, instituteId } = useAuth();
  const [members, setMembers] = useState<BatchMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [initiatingWith, setInitiatingWith] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBatchMembers() {
      if (!user?.id || !supabase) return;

      setIsLoading(true);
      try {
        // Get the current user's student record
        const { data: currentStudent } = await supabase
          .from("students")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (!currentStudent) {
          setMembers([]);
          setIsLoading(false);
          return;
        }

        // Get batches the current user is assigned to
        const { data: myBatches } = await supabase
          .from("student_batch_assignments")
          .select("batch_id, batches(name)")
          .eq("student_id", currentStudent.id)
          .eq("is_active", true);

        if (!myBatches || myBatches.length === 0) {
          setMembers([]);
          setIsLoading(false);
          return;
        }

        const batchIds = myBatches.map((b) => b.batch_id as string);
        const batchNameMap = new Map<string, string>();
        for (const b of myBatches) {
          const batch = (b as unknown as { batch_id: string; batches: { name: string } | null }).batches;
          batchNameMap.set(b.batch_id as string, batch?.name ?? "Unknown Batch");
        }

        // Get all students in those batches (excluding current user)
        const { data: peerAssignments } = await supabase
          .from("student_batch_assignments")
          .select("batch_id, students(user_id, users(id, name, avatar_url))")
          .in("batch_id", batchIds)
          .eq("is_active", true)
          .neq("student_id", currentStudent.id);

        if (!peerAssignments || peerAssignments.length === 0) {
          setMembers([]);
          setIsLoading(false);
          return;
        }

        // Build unique member list
        const seen = new Set<string>();
        const memberList: BatchMember[] = [];

        for (const assignment of peerAssignments) {
          const row = assignment as unknown as {
            batch_id: string;
            students: {
              user_id: string;
              users: { id: string; name: string; avatar_url: string | null } | null;
            } | null;
          };
          const student = row.students;

          if (!student?.users || !student.user_id) continue;
          if (seen.has(student.user_id)) continue;
          seen.add(student.user_id);

          memberList.push({
            user_id: student.user_id,
            name: student.users.name,
            avatar_url: student.users.avatar_url,
            batch_name: batchNameMap.get(row.batch_id) ?? "Unknown",
          });
        }

        // Sort alphabetically by name
        memberList.sort((a, b) => a.name.localeCompare(b.name));
        setMembers(memberList);
      } catch (err) {
        console.error("Failed to fetch batch members:", err);
        setMembers([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBatchMembers();
  }, [user?.id]);

  async function handleSelectMember(member: BatchMember) {
    if (!user?.id || !instituteId || initiatingWith) return;

    setInitiatingWith(member.user_id);
    setError(null);

    // Validate common batch before starting conversation
    const validation = await validateCommonBatch(user.id, member.user_id);
    if (!validation.success || validation.data === false) {
      setError(
        `Cannot message ${member.name}: no common batch found. You can only message students who share a batch with you.`,
      );
      setInitiatingWith(null);
      return;
    }

    // Create or get existing conversation
    const result = await getOrCreateConversation(
      user.id,
      member.user_id,
      instituteId,
    );

    if (result.success && result.data) {
      onStartConversation(result.data);
    } else {
      setError(result.error ?? "Failed to start conversation");
    }

    setInitiatingWith(null);
  }

  const filteredMembers = searchQuery.trim()
    ? members.filter((m) =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : members;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b">
        <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search members..."
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 border-b border-destructive/20 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">
              {searchQuery ? "No members found" : "No batch members available"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {filteredMembers.map((member) => (
              <button
                key={member.user_id}
                onClick={() => handleSelectMember(member)}
                disabled={initiatingWith === member.user_id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors w-full hover:bg-muted/50 border border-transparent disabled:opacity-50"
              >
                {/* Avatar */}
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage
                    src={member.avatar_url ?? undefined}
                    alt={member.name}
                  />
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate block">
                    {member.name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate block">
                    {member.batch_name}
                  </span>
                </div>

                {/* Loading indicator */}
                {initiatingWith === member.user_id && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
