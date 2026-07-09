# Implementation Plan — AI-Powered Ticket Management System

---

## Phase 1: Project Setup

> Goal: establish the monorepo structure, tooling, and local dev environment.

- [ ] Initialize monorepo structure (`/client`, `/server`)
- [ ] Set up Express server with TypeScript
- [ ] Set up React app with TypeScript
- [ ] Set up PostgreSQL database

---

## Phase 2: Database Schema

> Goal: define and migrate the full data model.

- [ ] 2.1 Define `User` model (id, name, email, password hash, role, createdAt)
- [ ] 2.2 Define `Session` model for database-backed sessions
- [ ] 2.3 Define `Ticket` model (id, subject, body, senderEmail, status, category, createdAt, updatedAt, assignedTo)
- [ ] 2.4 Define `Reply` model (id, ticketId, authorId, body, isAI, createdAt)
- [ ] 2.5 Define `KnowledgeBaseArticle` model (id, title, content, createdAt)
- [ ] 2.6 Run initial migration and seed Admin user

---

## Phase 3: Authentication

> Goal: working login/logout with role-based access.

- [ ] 3.1 Install and configure `express-session` with `connect-pg-simple` for DB-backed sessions
- [ ] 3.2 Password hashing with `bcrypt`
- [ ] 3.3 `POST /api/auth/login` — validate credentials, create session
- [ ] 3.4 `POST /api/auth/logout` — destroy session
- [ ] 3.5 `GET /api/auth/me` — return current user from session
- [ ] 3.6 Auth middleware: `requireAuth`, `requireAdmin`
- [ ] 3.7 Login page UI
- [ ] 3.8 Protected route wrapper in React Router
- [ ] 3.9 Persist session state in React (fetch `/me` on app load)

---

## Phase 4: User Management

> Goal: admin can create and manage agent accounts.

- [ ] 4.1 `POST /api/users` — create agent (admin only)
- [ ] 4.2 `GET /api/users` — list all users (admin only)
- [ ] 4.3 `PATCH /api/users/:id` — update user (name, email)
- [ ] 4.4 `DELETE /api/users/:id` — deactivate/remove agent (admin only)
- [ ] 4.5 User management page UI (admin only)
- [ ] 4.6 Create agent form (name, email, password)

---

## Phase 5: Ticket Management

> Goal: full ticket CRUD with filtering, sorting, and status transitions.

- [ ] 5.1 `POST /api/tickets` — create ticket manually
- [ ] 5.2 `GET /api/tickets` — list tickets with filters (status, category) and sorting (date, status)
- [ ] 5.3 `GET /api/tickets/:id` — get ticket detail with replies
- [ ] 5.4 `PATCH /api/tickets/:id` — update status (Open → Resolved → Closed) and category
- [ ] 5.5 `POST /api/tickets/:id/replies` — add a reply to a ticket
- [ ] 5.6 Ticket list page UI (table with filters and sort controls)
- [ ] 5.7 Ticket detail page UI (subject, body, status badge, reply thread)
- [ ] 5.8 Reply form on ticket detail page
- [ ] 5.9 Status update control on ticket detail page

---

## Phase 6: Dashboard

> Goal: at-a-glance view of ticket activity.

- [ ] 6.1 `GET /api/dashboard/stats` — counts by status and by category
- [ ] 6.2 Dashboard page UI with stat cards (Open, Resolved, Closed totals)
- [ ] 6.3 Breakdown chart or table by category
- [ ] 6.4 Recent tickets widget (latest 5–10 open tickets)

---

## Phase 7: AI Features

> Goal: Claude API integration for classification, summaries, and reply suggestions.

- [ ] 7.1 Set up Anthropic SDK in the server (`@anthropic-ai/sdk`)
- [ ] 7.2 Classify ticket on creation — call Claude to assign a category from (General Question, Technical Question, Refund Request)
- [ ] 7.3 Generate AI summary for a ticket — endpoint `GET /api/tickets/:id/summary`
- [ ] 7.4 Generate AI-suggested reply — endpoint `GET /api/tickets/:id/suggest-reply`
  - Retrieve relevant knowledge base articles and include as context
- [ ] 7.5 Display AI summary on ticket detail page
- [ ] 7.6 Display AI-suggested reply in reply form with "Use this reply" button
- [ ] 7.7 Knowledge base article CRUD (admin only) for RAG context

---

## Phase 8: Email Integration

> Goal: tickets created from inbound emails; replies sent as emails.

- [ ] 8.1 Set up SendGrid or Mailgun account and configure inbound routing
- [ ] 8.2 `POST /api/webhooks/inbound-email` — parse inbound webhook, create ticket from email
- [ ] 8.3 Validate webhook signature (security)
- [ ] 8.4 Send outbound email reply when agent submits a reply (`POST /api/tickets/:id/replies`)
- [ ] 8.5 Store sender email on ticket for reply threading

---

## Phase 9: Deployment

> Goal: containerized, production-ready deployment.

- [ ] 9.1 Write `Dockerfile` for the server
- [ ] 9.2 Write `Dockerfile` for the client (static build served via nginx)
- [ ] 9.3 Write `docker-compose.prod.yml` (client, server, PostgreSQL)
- [ ] 9.4 Configure production environment variables
- [ ] 9.5 Deploy to chosen cloud provider (Railway, Fly.io, or AWS)
- [ ] 9.6 Set up DB migrations as part of deploy step (`prisma migrate deploy`)
