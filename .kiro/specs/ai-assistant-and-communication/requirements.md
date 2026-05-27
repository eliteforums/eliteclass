# Requirements Document

## Introduction

This spec covers two features for the EliteClass education platform:

1. **AI Assistant** — A chat-based AI assistant powered by Groq API (LLaMA 3.1 8B Instant) that helps students and staff with study questions, course content, and general academic support. Users provide their own Groq API key (stored client-side in localStorage).

2. **Batch Communication** — A WhatsApp-style real-time chat system organized by batch. Students in the same batch can message each other and their instructor. Uses Supabase Realtime for live messaging.

Both features replace existing "coming soon" placeholders in the dashboard sidebar.

## Glossary

- **AI_Assistant**: The client-side chat interface that sends user prompts to the Groq API and displays streamed responses.
- **Groq_API**: A third-party fast LLM inference service accessed via REST API at `https://api.groq.com/openai/v1/chat/completions`.
- **API_Key_Store**: The localStorage-based mechanism that persists a user's Groq API key on their device.
- **Chat_Room**: A real-time messaging channel scoped to a single batch, where all enrolled students and assigned staff can exchange messages.
- **Message_Service**: The Supabase-backed service responsible for persisting and retrieving chat messages.
- **Realtime_Subscription**: A Supabase Realtime channel subscription that delivers new messages to connected clients without polling.
- **Batch_Member**: Any user (student or staff) who is enrolled in or assigned to a specific batch and therefore has access to that batch's Chat_Room.
- **Sidebar_Navigation**: The dashboard sidebar component that provides links to all platform features.

## Requirements

### Requirement 1: Groq API Key Management

**User Story:** As a user, I want to enter and store my Groq API key locally, so that I can activate the AI assistant without the platform storing my credentials server-side.

#### Acceptance Criteria

1. WHEN a user navigates to the AI Assistant page without a stored API key, THE AI_Assistant SHALL display a setup panel with instructions on how to obtain a Groq API key (steps: visit https://console.groq.com, sign up, navigate to API Keys, create key, paste into EliteClass).
2. WHEN a user submits a Groq API key, THE API_Key_Store SHALL persist the key in the browser's localStorage under a namespaced key specific to the current user ID.
3. WHEN a stored API key exists in localStorage for the current user, THE AI_Assistant SHALL skip the setup panel and display the chat interface directly.
4. WHEN a user clicks a "Remove API Key" action, THE API_Key_Store SHALL delete the stored key from localStorage and THE AI_Assistant SHALL return to the setup panel.
5. IF the stored API key is invalid (Groq returns a 401 response), THEN THE AI_Assistant SHALL display an error message indicating the key is invalid and prompt the user to re-enter a valid key.

### Requirement 2: AI Chat Interface

**User Story:** As a user, I want to chat with an AI assistant about my courses and studies, so that I can get instant help without waiting for a human tutor.

#### Acceptance Criteria

1. THE AI_Assistant SHALL display a scrollable message list showing the conversation history for the current session.
2. WHEN a user submits a message, THE AI_Assistant SHALL send the message to the Groq API using the `llama-3.1-8b-instant` model and display the response in the message list.
3. WHILE the Groq API is generating a response, THE AI_Assistant SHALL display a loading indicator in the message area.
4. WHEN a user submits a message, THE AI_Assistant SHALL include a system prompt that identifies the assistant as an EliteClass study helper and instructs it to provide educational support.
5. IF the Groq API returns a non-401 error (rate limit, server error, network failure), THEN THE AI_Assistant SHALL display a user-friendly error message with the option to retry the last message.
6. THE AI_Assistant SHALL maintain conversation context by sending previous messages in the chat history with each new request (up to a reasonable token limit).
7. WHEN a user clicks a "New Chat" action, THE AI_Assistant SHALL clear the current conversation history and start a fresh session.

### Requirement 3: AI Assistant Page Route

**User Story:** As a user, I want to access the AI assistant from the dashboard navigation, so that I can find it easily alongside other platform features.

#### Acceptance Criteria

1. THE Sidebar_Navigation SHALL display "AI Assistant" as an active, clickable link (not "coming soon") for admin, staff, and student roles.
2. WHEN a user clicks the "AI Assistant" link, THE Sidebar_Navigation SHALL navigate to `/dashboard/ai`.
3. THE AI_Assistant SHALL render a full-page chat interface at the `/dashboard/ai` route.

### Requirement 4: Batch Chat Room

**User Story:** As a student, I want to chat with other students and my instructor in my batch, so that I can collaborate and ask questions in real time.

#### Acceptance Criteria

1. WHEN a user navigates to the Communication page, THE Message_Service SHALL display a list of Chat_Rooms corresponding to the batches the user belongs to.
2. WHEN a user selects a Chat_Room, THE Message_Service SHALL load the most recent messages for that batch and display them in chronological order.
3. THE Chat_Room SHALL display each message with the sender's name and a timestamp (no profile pictures, no phone numbers).
4. WHEN a user submits a message in a Chat_Room, THE Message_Service SHALL persist the message to the Supabase `messages` table with the user ID, batch ID, message content, and timestamp.
5. WHEN a new message is inserted into the `messages` table for a batch, THE Realtime_Subscription SHALL deliver the message to all connected Batch_Members within that Chat_Room without requiring a page refresh.
6. WHILE a user is viewing a Chat_Room, THE Realtime_Subscription SHALL remain active and append new messages to the message list in real time.
7. IF the Realtime_Subscription disconnects, THEN THE Message_Service SHALL attempt to reconnect and display a connection status indicator to the user.

### Requirement 5: Batch Chat Access Control

**User Story:** As a platform administrator, I want chat access restricted to batch members only, so that conversations remain private to the relevant group.

#### Acceptance Criteria

1. THE Message_Service SHALL restrict Chat_Room access to users who are either enrolled students in the batch or staff assigned to the batch.
2. WHEN a student belongs to multiple batches, THE Message_Service SHALL display one Chat_Room per batch in the room list.
3. WHEN a staff member is assigned to multiple batches, THE Message_Service SHALL display one Chat_Room per assigned batch in the room list.
4. THE Message_Service SHALL enforce access control via Supabase Row Level Security (RLS) policies on the `messages` table, ensuring users can only read and write messages for batches they belong to.

### Requirement 6: Messages Database Schema

**User Story:** As a developer, I want a well-structured messages table in Supabase, so that chat data is stored efficiently and supports real-time subscriptions.

#### Acceptance Criteria

1. THE Message_Service SHALL store messages in a `messages` table with columns: `id` (UUID, primary key), `batch_id` (UUID, foreign key to batches), `sender_id` (UUID, foreign key to users), `content` (text), `created_at` (timestamptz, default now()).
2. THE Message_Service SHALL create an index on `(batch_id, created_at)` to support efficient chronological message retrieval per batch.
3. THE Message_Service SHALL enable Supabase Realtime on the `messages` table to support live message delivery.
4. THE Message_Service SHALL apply RLS policies that allow INSERT only when the sender_id matches the authenticated user and the user is a member of the referenced batch.
5. THE Message_Service SHALL apply RLS policies that allow SELECT only when the authenticated user is a member of the referenced batch.

### Requirement 7: Communication Page Route

**User Story:** As a user, I want to access batch chat from the dashboard navigation, so that I can communicate with my batch easily.

#### Acceptance Criteria

1. THE Sidebar_Navigation SHALL display "Communication" as an active, clickable link (not "coming soon") for admin, staff, and student roles.
2. WHEN a user clicks the "Communication" link, THE Sidebar_Navigation SHALL navigate to `/dashboard/messages`.
3. THE Chat_Room SHALL render a full-page interface at the `/dashboard/messages` route with a batch list panel and a message panel.
4. THE Chat_Room interface SHALL include a message input box fixed at the bottom of the message panel.

### Requirement 8: Communication UI Layout

**User Story:** As a user, I want a clean WhatsApp-like chat interface, so that messaging feels familiar and intuitive.

#### Acceptance Criteria

1. THE Chat_Room SHALL display messages in a vertically scrollable area with the most recent messages at the bottom.
2. WHEN a new message arrives or is sent, THE Chat_Room SHALL auto-scroll to the bottom of the message list.
3. THE Chat_Room SHALL visually distinguish messages sent by the current user (aligned right) from messages sent by others (aligned left).
4. THE Chat_Room SHALL display the sender's name above each message (or group of consecutive messages from the same sender).
5. THE Chat_Room input box SHALL support sending messages via Enter key press and via a send button click.
6. WHILE the message input is empty, THE Chat_Room SHALL disable the send button.
