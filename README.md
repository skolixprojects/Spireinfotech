# Spire — Course Platform with Mentorship

A self-paced course platform. Each course includes video lessons, weekly assignments, quizzes, a dedicated mentor, and a certificate on completion.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + Tailwind CSS + Framer Motion |
| Backend | Spring Boot 3 (Java 17+) |
| Database | PostgreSQL (Supabase) |
| Payments | Razorpay |
| Auth | JWT (access + refresh tokens) |
| Deploy | Vercel (frontend) + Railway (backend) |

## Project Structure

```
Spire-Compet/
├── frontend/          # Next.js 14 app (App Router)
│   ├── src/app/       # Pages (12 routes)
│   ├── src/components/# Reusable UI components
│   ├── src/lib/       # Utils, types, API client, auth
│   └── public/        # Static assets
├── backend/           # Spring Boot 3 API
│   ├── src/main/java/ # Controllers, Services, Entities
│   ├── pom.xml        # Maven dependencies
│   └── Dockerfile     # Docker image
├── database/          # SQL scripts
│   ├── schema.sql     # Table definitions
│   ├── seed.sql       # Demo data
│   └── README.md      # Setup guide
└── docker-compose.yml # Full-stack Docker setup
```

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

### Backend
```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

### Database
See [database/README.md](database/README.md) for Supabase setup.

## Deployment

- **Frontend**: Vercel (Root Directory = `frontend`)
- **Backend**: Railway (Root Directory = `backend`)
- **Database**: Supabase PostgreSQL

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@spire.dev | admin123 |
| Student | student@spire.dev | student123 |
| Instructor | arjun@spire.dev | password123 |
"# Spireinfotech" 
