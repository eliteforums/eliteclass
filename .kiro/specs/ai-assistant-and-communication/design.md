# Design Document

## Overview

This design implements two features for the EliteClass dashboard:

1. **AI Assistant** — A client-side chat interface at `/dashboard/ai` that uses the Groq API (LLaMA 3.1 8B Instant) for fast LLM inference. Users provide their own API key stored in localStorage.

2. **Batch Communication** — A real-time chat system at `/dashboard/messages` using Supabase Realtime. Messages are scoped to batches with RLS-enforced access control.

Both features integrate into the existing TanStack Start + React 19 + Supabase architecture.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard Shell                           │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Sidebar  │  │  /dashboard/ai   │  │ /dashboard/messages  │  │
│  │(updated) │  │                  │  │                      │  │
│  └──────────┘  │  ┌────────────┐  │  │  ┌──────┐ ┌──────┐  │  │
│                │  │ AIChat     │  │  │  │Batch │ │Msg   │  │  │
│                │  │ Component  │  │  │  │List  │ │Panel │  │  │
│                │  └─────┬──────┘  │  │  └──┬───┘ └──┬───┘  │  │
│                │        │         │  │     │        │       │  │
│                └────────┼─────────┘  └─────┼────────┼───────┘  │
│                         │                  │        │           │
└─────────────────────────┼──────────────────┼────────┼───────────┘
                          │                  │        │
                ┌─────────▼─────────┐  ┌─────▼────────▼─────────┐
                │   Groq API        │  │   Supabase             │
                │ (External, HTTPS) │  │  - messages table      │
                │                   │  │  - Realtime channel    │
                │ localStorage      │  │  - RLS policies        │
                │ (API key store)   │  └────────────────────────┘
                └───────────────────┘
```

### Data Flow — AI Assistant

1. User enters API key → stored in `localStorage` as `eliteclass_groq_key_{userId}`
2. User types message → appended to local conversation state (Zustand or React state)
3. Message + history sent to Groq API via `fetch` (client-side, no server proxy needed)
4. Streamed response displayed in chat → appended to conversation state
5. Conversation persists in memory only (cleared on page refresh or "New Chat")

### Data Flow — Batch Communication

1. User navigates to `/dashboard/messages` → fetch batches user belongs to
2. User selects a batch → fetch recent messages from `messages` table
3. Subscribe to Supabase Realtime channel for that batch
4. New messages arrive via subscription → appended to local state → rendered
5. User sends message → INSERT into `messages` table → Realtime broadcasts to all subscribers

## Database Schema

### New Table: `messages`

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient batch message retrieval (chronological)
CREATE INDEX idx_messages_batch_created ON messages (batch_id, created_at DESC);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

### RLS Policies

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is a batch member
CREATE OR REPLACE FUNCTION is_batch_member(p_user_id UUID, p_batch_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    -- Student enrolled in batch
    SELECT 1 FROM students s
    JOIN student_batch_assignments sba ON sba.student_id = s.id
    WHERE s.user_id = p_user_id AND sba.batch_id = p_batch_id AND sba.is_active = true
    UNION ALL
    -- Staff assigned to batch
    SELECT 1 FROM staff st
    JOIN staff_assignments sa ON sa.staff_id = st.id
    WHERE st.user_id = p_user_id AND sa.batch_id = p_batch_id
    UNION ALL
    -- Admin of the institute that owns the batch
    SELECT 1 FROM users u
    JOIN batches b ON b.institute_id = u.institute_id
    WHERE u.id = p_user_id AND u.role = 'admin' AND b.id = p_batch_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SELECT: only batch members can read messages
CREATE POLICY messages_select ON messages
  FOR SELECT USING (is_batch_member(auth.uid(), batch_id));

-- INSERT: only batch members can send, and sender_id must match auth user
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND is_batch_member(auth.uid(), batch_id)
  );
```

## File Structure

### New Files

```
src/
├── routes/dashboard/
│   ├── ai.tsx                          # AI Assistant route page
│   └── messages.tsx                    # Communication route page
├── components/dashboard/
│   ├── ai/
│   │   ├── AIAssistantPage.tsx         # Main AI page (key setup or chat)
│   │   ├── AIKeySetup.tsx             # API key entry + instructions
│   │   └── AIChat.tsx                 # Chat interface component
│   └── communication/
│       ├── CommunicationPage.tsx       # Main communication page
│       ├── BatchList.tsx              # Sidebar list of batch chat rooms
│       ├── ChatRoom.tsx               # Message display + input
│       └── MessageBubble.tsx          # Individual message component
├── services/
│   └── message.service.ts             # Supabase message CRUD + realtime
├── hooks/
│   ├── useGroqChat.ts                 # Hook for Groq API interaction
│   └── useBatchMessages.ts           # Hook for realtime batch messages
└── store/
    └── aiKeyStore.ts                  # Zustand store for API key management

supabase/
└── migrations/
    └── xxx_create_messages_table.sql  # Messages table + RLS + Realtime
```

### Modified Files

```
src/components/dashboard/Sidebar.tsx   # Remove comingSoon flags for AI & Communication
```

## Component Design

### AI Assistant

#### `AIAssistantPage.tsx`
- Checks if API key exists via `useAIKeyStore()`
- If no key: renders `<AIKeySetup />`
- If key exists: renders `<AIChat />`

#### `AIKeySetup.tsx`
- Displays numbered instructions for obtaining a Groq API key
- Input field for pasting the key
- "Save Key" button that validates format (starts with `gsk_`) and stores in localStorage
- Links to https://console.groq.com

#### `AIChat.tsx`
- Uses `useGroqChat()` hook for message management
- Scrollable message list with auto-scroll on new messages
- Input box at bottom with Enter-to-send
- "New Chat" button to clear conversation
- "Remove API Key" option in header/settings

#### `useGroqChat.ts`
- Manages conversation state: `messages: Array<{role, content}>`
- `sendMessage(content)`: appends user message, calls Groq API, appends assistant response
- Calls `POST https://api.groq.com/openai/v1/chat/completions` with:
  - `model: "llama-3.1-8b-instant"`
  - `messages`: system prompt + conversation history
  - `Authorization: Bearer {apiKey}`
- System prompt: "You are an EliteClass AI study assistant. Help students with their coursework, explain concepts, and provide educational support. Be concise and helpful."
- Handles errors: 401 → invalid key flow, others → retry option
- Limits context window to last 20 messages to stay within token limits

#### `aiKeyStore.ts`
- Zustand store with `persist` middleware (localStorage)
- State: `{ apiKey: string | null }`
- Actions: `setApiKey(key)`, `clearApiKey()`
- Storage key: `eliteclass_groq_key_{userId}` (user-scoped)

### Batch Communication

#### `CommunicationPage.tsx`
- Two-panel layout: batch list (left) + chat room (right)
- Fetches user's batches on mount
- Manages selected batch state

#### `BatchList.tsx`
- Lists batches the current user belongs to
- Shows batch name and course name
- Highlights currently selected batch
- For students: fetches from `student_batch_assignments`
- For staff: fetches from `staff_assignments`
- For admin: fetches all institute batches

#### `ChatRoom.tsx`
- Displays messages for selected batch
- Uses `useBatchMessages()` hook for data + realtime
- Auto-scrolls to bottom on new messages
- Message input with send button and Enter key support
- Connection status indicator

#### `MessageBubble.tsx`
- Displays sender name, message content, timestamp
- Right-aligned + colored for current user's messages
- Left-aligned for others' messages
- Groups consecutive messages from same sender

#### `useBatchMessages.ts`
- Fetches initial messages: `SELECT * FROM messages WHERE batch_id = ? ORDER BY created_at ASC LIMIT 50`
- Subscribes to Supabase Realtime: `supabase.channel('batch-{id}').on('postgres_changes', ...)`
- Provides `sendMessage(content)` function
- Handles reconnection on disconnect
- Returns: `{ messages, isLoading, isConnected, sendMessage }`

#### `message.service.ts`
- `getMessagesForBatch(batchId, limit)`: paginated message fetch with sender name join
- `sendMessage(batchId, content)`: INSERT into messages table
- `getUserBatches(userId, role)`: fetch batches user has access to
- All functions return `ApiResponse<T>` pattern matching existing services

### Sidebar Update

Remove `comingSoon: true` from the "Communication" and "AI Assistant" nav items in the admin role's navigation. Add these items to staff and student roles as well.

## Technical Decisions

1. **No server proxy for Groq API** — The API key is user-provided and stored client-side. Direct browser-to-Groq calls avoid server complexity and keep the key off the server.

2. **No message persistence for AI chat** — Conversations are session-only (in-memory). This keeps the feature simple and avoids storing potentially sensitive AI interactions.

3. **Supabase Realtime over polling** — Realtime provides instant message delivery with minimal client code. The existing Supabase setup already supports it.

4. **RLS for access control** — Leverages Supabase's built-in RLS rather than application-level checks. This ensures security even if the client is compromised.

5. **Zustand for API key store** — Consistent with the project's existing state management pattern. The `persist` middleware handles localStorage serialization.

6. **Message limit of 4000 chars** — Prevents abuse while allowing substantial messages. Enforced at DB level via CHECK constraint.

7. **Context window of 20 messages** — Balances conversation quality with token limits for the 8B model. Prevents excessive API costs on the user's key.

## Error Handling

| Scenario | Handling |
|----------|----------|
| Invalid Groq API key (401) | Show error, prompt to re-enter key |
| Groq rate limit (429) | Show "Rate limited, try again in a moment" with retry button |
| Groq server error (5xx) | Show generic error with retry button |
| Network failure (Groq) | Show "Network error" with retry button |
| Supabase Realtime disconnect | Show "Reconnecting..." indicator, auto-retry |
| Message send failure | Show toast via sonner, keep message in input for retry |
| Empty batch list | Show "No batches found" empty state |

## Performance Considerations

- Messages loaded with `LIMIT 50` initially; older messages loaded on scroll-up (pagination)
- Realtime subscription scoped to single batch at a time (not all batches)
- AI conversation state kept in memory only — no localStorage bloat
- Batch list cached via React Query with stale-while-revalidate
