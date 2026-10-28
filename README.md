# KastoChha (कस्तो छ?)

> **Nepal's independent, community-driven decision network, real-world review platform, and AI answer engine.**

[![Tests](https://img.shields.io/badge/tests-204%20passed-brightgreen.svg)]()
[![Next.js](https://img.shields.io/badge/Next.js-14.2.25-black.svg)]()
[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)]()
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green.svg)]()
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg)]()

---

## 📖 Complete Documentation

For the complete, in-depth architectural and engineering documentation, please see:

👉 **[DOCUMENTATION.md](./DOCUMENTATION.md)** 👈

It includes:
- **Architecture & System Design**: High-level flow, Edge middleware, and external service topologies.
- **Domain Model & PostgreSQL Schema**: Complete table schemas, relations, views, triggers, and PL/pgSQL stored procedures (`cast_vote`, `consume_chat_quota`).
- **Core Engineering Deep Dives**: KastoChha Assist (Romanized Nepali AI), Trending Searches Ranking Engine, Atomic Voting, Question-Experience Convergence, and Admin Control Plane.
- **Security & Privacy Architecture**: Strict CSP with per-request nonces, Two-Tier Hybrid Rate Limiting, Proxy Depth IP resolution, Streaming Byte-Limit Guards, and Salted HMAC Anonymization.
- **SEO & Syndication**: Indexation Gate thresholds, dynamic XML sitemaps with honest `lastmod`, IndexNow protocol integration, and Edge Open Graph image generation.
- **API Reference**: Detailed contracts for all Route Handlers.
- **Operations & Runbooks**: Database migrations, admin bootstrapping, environment variables, and testing guidelines.

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js**: v18.17+ or v20+
- **Supabase**: PostgreSQL project with `pgcrypto` and `pg_trgm` extensions
- **Clerk**: Application keys for user authentication and role-based access control
- **Google AI Studio**: Gemini API key for conversational AI and search grounding
- **Upstash Redis** *(Optional)*: Sliding-window burst rate limiter

### 2. Installation
```bash
# Clone the repository
git clone <repo-url>
cd site

# Install dependencies
npm install
```

### 3. Environment Setup
```bash
# Copy sample configuration
cp .env.example .env.local
```
Fill in the credentials in `.env.local`:
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` & `SUPABASE_DB_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` & `CLERK_SECRET_KEY`
- `GEMINI_API_KEY`

### 4. Database Setup & Seeding
```bash
# Run all database migrations
npm run db:migrate

# Seed sample trending topics, battles, and reels
npm run db:seed
```

### 5. Bootstrap Initial Super Admin
```bash
# Grant super_admin role to your Clerk user
node ./scripts/set_role.js you@example.com super_admin
```

### 6. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing

KastoChha includes a comprehensive automated test suite with **204 tests**, using Node's native test runner and `@electric-sql/pglite` (embedded in-memory PostgreSQL):

```bash
npm test
```

---

## 🛠️ Project Structure

```text
├── app/                      # Next.js 14 App Router
│   ├── (auth)/               # Sign-in and Sign-up Clerk pages
│   ├── admin/                # Admin control plane (content, roles, searches)
│   ├── api/                  # Route Handlers (chat, votes, reviews, admin, og)
│   ├── battle/               # Head-to-head battle split views & permalinks
│   ├── chat/                 # KastoChha Assist AI conversational interface
│   ├── components/           # Reusable UI & client components
│   ├── discussions/          # Community experiences, threads & topic pages
│   ├── featured/             # Editorial articles and stories
│   ├── trending/             # Trending polls and sentiment breakdowns
│   ├── globals.css           # Global typography & design system
│   ├── layout.js             # Root Layout (CSP nonces, Fonts, Clerk, Analytics)
│   ├── page.js               # Homepage server orchestrator
│   └── sitemap.xml/          # Dynamic XML Sitemap route handler
├── lib/                      # Core business logic & server utilities
│   ├── admin/                # Audit logging & content type definitions
│   ├── auth/                 # Clerk integration & RBAC roles
│   ├── seo/                  # Schema.org, IndexNow, Indexation gating
│   ├── supabase/             # Server client & safe queries
│   ├── chatQuota.js          # Postgres chat usage ledger & HMAC identities
│   ├── csp.js                # Dynamic Content-Security-Policy generator
│   ├── gemini.js             # Gemini 2.5 Flash wrapper with SSE streaming
│   ├── ratelimit.js          # Upstash Redis sliding window limiter
│   └── trendingSearches.js   # Trending search ranking algorithm & rules
├── scripts/                  # Operations & management scripts
│   ├── db_migrate.js         # Run SQL migrations
│   ├── db_apply.js           # Seed & apply helper
│   └── set_role.js           # Clerk user role bootstrapping
├── supabase/                 # PostgreSQL configuration & migrations
│   ├── migrations/           # Versioned SQL migrations (0001 to 0016)
│   └── schema.sql            # Base schema definitions
└── tests/                    # Automated test suites & test harnesses
```

---

## 🛡️ Security & Performance Highlights

- **Per-Request Nonce CSP**: Enforces `'strict-dynamic'` script execution without unsafe inlines.
- **Atomic Operations**: Eliminates vote desynchronization and race conditions via PostgreSQL row locks (`FOR UPDATE`) in `cast_vote`.
- **Hybrid Rate Limiting**: Upstash Redis sliding window burst guard backed by PostgreSQL persistent ledger quota (`consume_chat_quota`).
- **Privacy-First Logging**: Guest IP addresses are hashed using secret HMACs before entering database records.
- **Indexation Quality Gate**: Shallow content (<2 experiences or <80 words) is automatically gated with `noindex` to preserve domain search reputation.

---

## 📄 License

Private & Proprietary © KastoChha. All rights reserved.
