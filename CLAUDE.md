# Helpdesk - AI-Powered Ticket Management System

## Project Overview
A ticket management system that uses AI to classify support emails, summarize
tickets, and suggest replies — reducing manual work for support agents.

## Tech Stack
- **Frontend**: React + TypeScript, Tailwind CSS, React Router
- **Backend**: Node.js + Express + TypeScript (Bun runtime)
- **Database**: PostgreSQL + Prisma
- **AI**: Claude API (Anthropic)
- **Authentication**: Database-backed sessions (`express-session` + `connect-pg-simple`)

## Project Structure
```
/client   # React frontend
/server   # Express API
```

## Development
```sh
# Frontend
cd client && bun run dev

# Backend
cd server && bun run dev
```

## Deployment
Both apps are containerized with Docker and deployed to a cloud provider
(Railway, Fly.io, or AWS), with PostgreSQL migrations run via
`prisma migrate deploy`.

## Key Conventions
- Always use Context7 to fetch the latest official docs before writing code.
- Follow `implementation-plan.md` and build one phase at a time.
- Write clean, modular code — no unnecessary abstractions.
- Do not change the locked tech stack without explicit approval.
