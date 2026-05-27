# Tasks

## Task 1: Database Migration — Messages Table

Create the Supabase migration for the messages table with RLS policies and Realtime.

- [x] 1.1 Create migration file `supabase/migrations/xxx_create_messages_table.sql` with the `messages` table schema (id, batch_id, sender_id, content, created_at)
- [x] 1.2 Add CHECK constraint on content (non-empty, max 4000 chars)
- [x] 1.3 Create index `idx_messages_batch_created` on (batch_id, created_at DESC)
- [x] 1.4 Enable RLS on the messages table
- [x] 1.5 Create `is_batch_member` helper function that checks student_batch_assignments, staff_assignments, and admin role
- [x] 1.6 Create SELECT RLS policy allowing only batch members to read messages
- [x] 1.7 Create INSERT RLS policy allowing batch members to insert with sender_id = auth.uid()
- [x] 1.8 Add messages table to supabase_realtime publication

## Task 2: Sidebar Navigation Update

Remove "coming soon" flags and add AI/Communication links for all relevant roles.

- [~] 2.1 Remove `comingSoon: true` from "Communication" nav item in admin role navigation
- [~] 2.2 Remove `comingSoon: true` from "AI Assistant" nav item in admin role navigation
- [~] 2.3 Add "Communication" nav item (url: `/dashboard/messages`, icon: MessageSquare) to staff role navigation
- [~] 2.4 Add "AI Assistant" nav item (url: `/dashboard/ai`, icon: Sparkles) to staff role navigation
- [~] 2.5 Add "Communication" nav item to student role navigation
- [~] 2.6 Add "AI Assistant" nav item to student role navigation

## Task 3: AI Key Store

Create the Zustand store for managing the Groq API key in localStorage.

- [~] 3.1 Create `src/store/aiKeyStore.ts` with Zustand persist middleware
- [~] 3.2 Implement state: `apiKey: string | null`, `isKeyValid: boolean`
- [~] 3.3 Implement actions: `setApiKey(key: string)`, `clearApiKey()`, `setKeyValid(valid: boolean)`
- [~] 3.4 Configure localStorage key as `eliteclass-groq-key` (user-scoped via store partitioning or key prefix)

## Task 4: Groq Chat Hook

Create the custom hook for managing AI chat conversations via the Groq API.

- [~] 4.1 Create `src/hooks/useGroqChat.ts` with message state management
- [~] 4.2 Define message type: `{ id: string, role: 'user' | 'assistant' | 'system', content: string, timestamp: Date }`
- [~] 4.3 Implement `sendMessage(content: string)` that appends user message and calls Groq API
- [~] 4.4 Implement Groq API call: POST to `https://api.groq.com/openai/v1/chat/completions` with model `llama-3.1-8b-instant`
- [~] 4.5 Include system prompt: "You are an EliteClass AI study assistant. Help students with their coursework, explain concepts, and provide educational support. Be concise and helpful."
- [~] 4.6 Limit conversation context to last 20 messages sent to API
- [~] 4.7 Handle 401 errors by calling `setKeyValid(false)` on the AI key store
- [~] 4.8 Handle non-401 errors with retry state (`error`, `canRetry`)
- [~] 4.9 Implement `clearChat()` to reset conversation
- [~] 4.10 Implement `retryLast()` to resend the last user message

## Task 5: AI Assistant UI Components

Build the AI Assistant page components.

- [~] 5.1 Create `src/components/dashboard/ai/AIKeySetup.tsx` with Groq API key instructions (5 numbered steps) and input field
- [~] 5.2 Add key format validation (starts with `gsk_`) before saving
- [~] 5.3 Create `src/components/dashboard/ai/AIChat.tsx` with scrollable message list and input box
- [~] 5.4 Implement auto-scroll to bottom on new messages using `useRef` and `scrollIntoView`
- [~] 5.5 Add loading indicator while waiting for AI response
- [~] 5.6 Add "New Chat" button in the header area
- [~] 5.7 Add "Remove API Key" option (button or dropdown action)
- [~] 5.8 Style user messages (right-aligned, primary color) and assistant messages (left-aligned, muted background)
- [~] 5.9 Implement Enter-to-send and disable send button when input is empty
- [~] 5.10 Create `src/components/dashboard/ai/AIAssistantPage.tsx` that conditionally renders AIKeySetup or AIChat based on key presence

## Task 6: AI Assistant Route

Create the TanStack Router route for the AI Assistant page.

- [~] 6.1 Create `src/routes/dashboard/ai.tsx` route file
- [~] 6.2 Import and render `AIAssistantPage` component
- [~] 6.3 Wrap with appropriate auth guard (allow admin, staff, student roles)

## Task 7: Message Service

Create the Supabase service for batch messaging.

- [~] 7.1 Create `src/services/message.service.ts` following existing service patterns (ApiResponse<T> return type)
- [~] 7.2 Implement `getUserBatches(userId, role, instituteId)` that fetches batches based on role (student_batch_assignments for students, staff_assignments for staff, all batches for admin)
- [~] 7.3 Implement `getMessagesForBatch(batchId, limit = 50)` with sender name join from users table
- [~] 7.4 Implement `sendMessage(batchId, senderId, content)` that inserts into messages table
- [~] 7.5 Define `ChatMessage` type: `{ id, batch_id, sender_id, sender_name, content, created_at }`

## Task 8: Batch Messages Hook

Create the custom hook for real-time batch messaging.

- [~] 8.1 Create `src/hooks/useBatchMessages.ts`
- [~] 8.2 Implement initial message fetch on batch selection using `getMessagesForBatch`
- [~] 8.3 Set up Supabase Realtime subscription: `supabase.channel('batch-messages-{batchId}').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'batch_id=eq.{batchId}' })`
- [~] 8.4 Append new messages from Realtime to local state
- [~] 8.5 Implement `sendMessage(content)` using message service
- [~] 8.6 Track connection status (`isConnected`) and handle reconnection
- [~] 8.7 Clean up subscription on batch change or unmount

## Task 9: Communication UI Components

Build the Communication page components.

- [~] 9.1 Create `src/components/dashboard/communication/BatchList.tsx` showing user's batches with batch name and course name
- [~] 9.2 Highlight the currently selected batch in the list
- [~] 9.3 Create `src/components/dashboard/communication/MessageBubble.tsx` with sender name, content, timestamp
- [~] 9.4 Style own messages right-aligned (primary bg) and others' messages left-aligned (muted bg)
- [~] 9.5 Group consecutive messages from same sender (show name only on first)
- [~] 9.6 Create `src/components/dashboard/communication/ChatRoom.tsx` with message list and input area
- [~] 9.7 Implement auto-scroll to bottom on new messages
- [~] 9.8 Add message input with Enter-to-send and send button (disabled when empty)
- [~] 9.9 Add connection status indicator (green dot = connected, yellow = reconnecting)
- [~] 9.10 Create `src/components/dashboard/communication/CommunicationPage.tsx` with two-panel layout (batch list + chat room)
- [~] 9.11 Show empty state when no batches are available ("No batches found")
- [~] 9.12 Show placeholder when no batch is selected ("Select a batch to start chatting")

## Task 10: Communication Route

Create the TanStack Router route for the Communication page.

- [~] 10.1 Create `src/routes/dashboard/messages.tsx` route file
- [~] 10.2 Import and render `CommunicationPage` component
- [~] 10.3 Wrap with appropriate auth guard (allow admin, staff, student roles)

## Task 11: Integration & Polish

Final integration, error handling, and UI polish.

- [~] 11.1 Add sonner toast notifications for message send failures
- [~] 11.2 Add error boundary or error state for AI chat API failures
- [~] 11.3 Test AI Assistant flow: no key → setup → enter key → chat → remove key → back to setup
- [~] 11.4 Test Communication flow: batch list → select batch → send message → receive realtime message
- [~] 11.5 Verify sidebar links work for admin, staff, and student roles
- [~] 11.6 Ensure responsive layout for mobile (batch list collapses or becomes a dropdown on small screens)
