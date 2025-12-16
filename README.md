# Blue Lotus AI - Multi-Tenant SaaS Backend

Production-ready backend for Blue Lotus AI platform using Bun, Supabase, and event-driven architecture.

## Architecture

**Multi-Tenant SaaS** with per-business subdomain isolation:
- `business1.yourdomain.com` → Business 1 data (RLS-filtered)
- `business2.yourdomain.com` → Business 2 data (RLS-filtered)
- `business3.yourdomain.com` → Business 3 data (RLS-filtered)

**ONE deployment serves ALL businesses** with database-level tenant isolation via Row Level Security (RLS).

## Key Features

- **Fast Webhook Ingestion** (<100ms) - Write raw data, return 200, queue async processing
- **Event-Driven Architecture** - BullMQ + Redis job queue for AI processing
- **RLS-Enforced Multi-Tenancy** - Database-level data isolation per business
- **Subdomain Routing** - Automatic business resolution from URL
- **Async AI Processing** - Claude API for sentiment, products, issues extraction
- **Precomputed Dashboard Data** - Read-only API with <200ms response times
- **Scalable** - Same $5-10/month cost for 1 business or 1000 businesses

## Tech Stack

- **Runtime**: Bun (fast JavaScript/TypeScript runtime)
- **Database**: Supabase (PostgreSQL with RLS)
- **Queue**: BullMQ + Redis (async job processing)
- **AI**: Anthropic Claude Sonnet 4.5
- **Deployment**: Railway / Fly.io / Render

## Project Structure

```
server-bun/
├── src/
│   ├── db/
│   │   └── supabase-client.ts      # RLS-aware Supabase clients
│   ├── ingestion/
│   │   └── vapi-webhook.ts         # Fast webhook handler (<100ms)
│   ├── processing/
│   │   └── ai-worker.ts            # Async AI processing (TODO)
│   ├── api/
│   │   ├── dashboard-server.ts     # Multi-tenant dashboard serving
│   │   └── dashboard-api.ts        # RLS-enforced API (TODO)
│   ├── queue/
│   │   └── job-publisher.ts        # BullMQ integration
│   ├── utils/
│   │   └── subdomain.ts            # Subdomain extraction & routing
│   ├── auth/                       # JWT authentication (TODO)
│   └── index.ts                    # Main entry point
├── package.json
├── tsconfig.json
└── .env.example
```

## Quick Start

### Prerequisites

- Bun runtime: `curl -fsSL https://bun.sh/install | bash`
- Supabase account: app.supabase.com
- Redis (Upstash free tier or Railway built-in)
- Anthropic API key: console.anthropic.com

### Installation

```bash
# Clone repository
git clone https://github.com/bluelotus98/blue-lotus-backend.git
cd blue-lotus-backend

# Install dependencies
bun install

# Copy environment template
cp .env.example .env
# Edit .env with your credentials

# Run in development mode
bun run dev
```

### Environment Variables

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
SUPABASE_ANON_KEY=your_anon_key

# Redis (BullMQ)
REDIS_HOST=your-redis.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-api03-xxx

# Server
PORT=3001
NODE_ENV=production
API_URL=/api
```

## Database Setup

1. **Run migrations** in Supabase SQL Editor:
   - `deployment/database/01_initial_schema.sql` - Initial tables
   - `deployment/database/02_add_multi_tenancy.sql` - RLS + multi-tenancy

2. **Create first business**:
   ```sql
   INSERT INTO businesses (id, name, subdomain, vapi_assistant_id, business_type)
   VALUES ('demo-001', 'Demo Business', 'demo', 'asst_xxx', 'general');
   ```

3. **Verify RLS policies**:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'calls';
   ```

## Deployment

### Railway (Recommended)

1. **Sign up** at railway.app
2. **New Project** → Deploy from GitHub
3. **Select repository**: `bluelotus98/blue-lotus-backend`
4. **Add Redis service**: Railway → New → Database → Redis
5. **Set environment variables** (see above)
6. **Deploy**: Automatic on push to main

### Custom Domain Setup

1. **Add wildcard domain** in Railway: `*.yourdomain.com`
2. **Configure DNS** (Cloudflare recommended):
   ```
   Type: CNAME
   Name: *
   Target: your-backend.up.railway.app
   Proxy: ON
   ```
3. **SSL**: Railway auto-provisions certificates

## API Endpoints

### Webhooks (Ingestion)
- `POST /webhooks/vapi` - Vapi call.ended webhook
- `POST /webhooks/botpress` - Botpress webhook (TODO)

### Dashboard (Multi-Tenant)
- `GET /` - Business dashboard (subdomain-aware)
- `GET /dashboard` - Dashboard HTML

### API (Read-Only)
- `GET /api/dashboard/calls` - Call history (TODO)
- `GET /api/dashboard/stats` - Statistics (TODO)
- `GET /api/dashboard/sentiment` - Sentiment breakdown (TODO)
- `GET /api/dashboard/opportunities` - High-value leads (TODO)

### Health & Monitoring
- `GET /health` - Health check with queue stats
- `GET /queue/stats` - BullMQ queue statistics

## Development

```bash
# Development with hot reload
bun run dev

# Production build
bun run build

# Production start
bun run start

# Test webhook
curl -X POST http://localhost:3001/webhooks/vapi \
  -H "Content-Type: application/json" \
  -d '{"type":"call.ended","call":{...}}'

# Check health
curl http://localhost:3001/health

# Check queue stats
curl http://localhost:3001/queue/stats
```

## Architecture Decisions

### Why Multi-Tenant (Not Per-Business Deployment)?

**Before** (per-business deployment):
- Cost: $37-124/month per business
- Speed: 3-10 seconds dashboard loads (AI in read path)
- Complexity: Deploy/manage infrastructure for each client
- Scalability: Linear cost scaling

**After** (multi-tenant):
- Cost: $5-10/month for ALL businesses (10-20x reduction)
- Speed: <200ms dashboard loads (precomputed data)
- Complexity: One deployment, database RLS handles isolation
- Scalability: Same cost for 1 or 1000 businesses

### Why Event-Driven (Not Synchronous)?

**Webhook Flow**:
1. Vapi webhook arrives → Write raw call data to DB
2. Publish job to queue → Return HTTP 200 (<100ms)
3. Background worker → Process with Claude API (5-30s)
4. Write precomputed results → Dashboard reads instantly

**Benefits**:
- Fast webhook response (no timeouts)
- Retry logic (resilient to AI failures)
- Dashboard always fast (reads precomputed data)
- Scalable (workers process jobs in parallel)

### Why RLS (Not Application-Level Filtering)?

**Row Level Security** enforces data isolation at database level:
- Business A queries `calls` → Only sees their data
- Business B queries `calls` → Only sees their data
- Even with leaked credentials, RLS prevents cross-tenant access
- GDPR/SOC2 compliant (database-enforced isolation)

## Cost Breakdown

| Component | Service | Cost/Month |
|-----------|---------|------------|
| Backend | Railway | $5-10 |
| Redis | Railway (included) | $0 |
| Database | Supabase | $0-25 |
| AI Processing | Anthropic Claude | Usage-based |
| **Total** | | **$5-40/month** |

**Per-business cost**: $0 (shared infrastructure)

## Documentation

- **SAAS_REFACTOR_PLAN.md** - Complete refactoring strategy
- **SUBDOMAIN_SETUP_GUIDE.md** - Per-business URL setup
- **DATABASE_SETUP_GUIDE.md** - Database migration guide
- **IMPLEMENTATION_PROGRESS.md** - Current status

## Status

- ✅ Webhook ingestion (fast, <100ms)
- ✅ Job queue (BullMQ + Redis)
- ✅ Subdomain routing
- ✅ Multi-tenant dashboard serving
- ⏱️ AI worker (async processing)
- ⏱️ Dashboard API (RLS-enforced reads)
- ⏱️ Authentication (JWT with business_id)

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m "Add my feature"`
4. Push to branch: `git push origin feature/my-feature`
5. Open Pull Request

## License

MIT

## Support

- **Issues**: https://github.com/bluelotus98/blue-lotus-backend/issues
- **Docs**: See `/docs` folder
- **Email**: support@bluelotussolutions.ai
