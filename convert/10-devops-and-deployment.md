# DevOps And Deployment Plan

## DevOps Goals

- Make local development repeatable.
- Separate frontend, API, worker, database, cache, and storage concerns.
- Support staging before production.
- Make migrations, backups, and rollbacks explicit.
- Prepare for future Kubernetes without requiring it at MVP.

## Local Development Setup

Use Docker Compose for infrastructure dependencies and optionally for app services.

Recommended local services:

- PostgreSQL
- Redis
- MinIO
- Mailhog or SMTP capture
- API
- Worker
- Web
- Nginx optional

Local developer flow:

```bash
cp .env.example .env
docker compose up -d postgres redis minio mailhog
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Docker Compose Services

Suggested services:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: logisticplus
      POSTGRES_USER: logisticplus
      POSTGRES_PASSWORD: logisticplus
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    depends_on:
      - postgres
      - redis
      - minio

  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    command: pnpm worker:start
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    depends_on:
      - api
```

## PostgreSQL Setup

- PostgreSQL 16 recommended.
- Enable `pgcrypto`, `citext`, `pg_trgm`.
- Enable PostGIS when map/location features begin.
- Use separate databases for:
  - local
  - test
  - staging
  - production
- Use least-privilege DB users in production.

## Redis Setup

Redis responsibilities:

- Rate limiting.
- BullMQ queues.
- Cache.
- Optional distributed locks.
- Optional session denylist/revocation cache.

Do not use in-memory rate limits in production.

## Object Storage Setup

Use S3-compatible storage.

Buckets:

- `logisticplus-documents`
- `logisticplus-exports`
- `logisticplus-temp`

Rules:

- Buckets private by default.
- Signed URLs expire quickly.
- Object keys include tenant id.
- Lifecycle rules clean temp/export files.
- Server-side encryption where provider supports it.

## Environment Variable Structure

Groups:

- App:
  - `NODE_ENV`
  - `APP_PUBLIC_URL`
  - `WEB_PUBLIC_URL`
  - `API_PUBLIC_URL`
- Database:
  - `DATABASE_URL`
- Auth:
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `COOKIE_DOMAIN`
- Redis:
  - `REDIS_URL`
- Storage:
  - `S3_ENDPOINT`
  - `S3_REGION`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_DOCUMENT_BUCKET`
- Billing:
  - `ZARINPAL_SANDBOX`
  - `ZARINPAL_MERCHANT_ID`
- SMS:
  - `SMS_ENABLED`
  - `SMS_DRY_RUN`
  - `SMSIR_API_KEY`
  - `SMSIR_LINE_NUMBER`
  - `SMSIR_USE_DEFAULT_LINE`
- Observability:
  - `SENTRY_DSN`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `LOG_LEVEL`

## Staging Environment

Staging must be production-like:

- Separate database.
- Separate Redis.
- Separate object bucket/prefix.
- Separate Zarinpal test/live-safe setup.
- Separate SMS dry-run or explicitly guarded live credentials.
- Seeded owner and demo tenant.
- Runs migrations before deploy.
- Runs smoke tests after deploy.

Staging smoke:

- Health/readiness.
- Login.
- Tenant dashboard.
- Customer CRUD.
- Shipment + tracking access.
- Document upload/download.
- Public tracking DTO leak test.
- Payment handoff/cancel path.
- SMS dry-run queue.

## Production Environment

Production requirements:

- HTTPS only.
- Secure cookies.
- Managed PostgreSQL with backups.
- Managed Redis.
- Private object storage.
- API and worker scaled independently.
- Migrations executed with lock/single runner.
- Observability enabled.
- Alerts configured.
- Error tracking PII scrubber enabled.
- Rate limiting Redis-backed.

## CI/CD Pipeline Recommendation

Pull request pipeline:

- Install dependencies.
- Typecheck.
- Lint.
- Unit tests.
- Build web/API.
- Migration check.
- API integration tests with Postgres.
- Frontend component tests.
- Playwright critical E2E subset.

Main branch pipeline:

- Build Docker images.
- Push images.
- Deploy to staging.
- Run migrations on staging.
- Run staging smoke tests.
- Require manual approval for production.

Production pipeline:

- Backup database.
- Run migrations.
- Deploy API.
- Deploy worker.
- Deploy web.
- Run health checks.
- Run smoke tests.
- Monitor errors/latency.

## Database Migration Flow

Rules:

- All schema changes through migrations.
- Migrations are reviewed SQL.
- Data backfills are idempotent and resumable.
- Production migration uses advisory lock.
- Backup before migration.
- Long-running migrations split into:
  - Add nullable column.
  - Backfill in batches.
  - Add constraint/index concurrently.
  - Switch app.
  - Remove old column later.

## Backup Strategy

Database:

- Automated daily backups.
- Point-in-time recovery if provider supports it.
- Manual backup before migrations/cutover.
- Restore drill before launch.

Object storage:

- Versioning or retention policy.
- Cross-region or provider-level backup for enterprise.
- Periodic inventory/checksum audit.

Redis:

- Treat as ephemeral except queues.
- Queue durability via BullMQ Redis persistence as needed.

## Rollback Strategy

Application rollback:

- Keep previous Docker image.
- Roll back web/API/worker independently.

Database rollback:

- Prefer backward-compatible migrations.
- Avoid immediate destructive migrations.
- Keep rollback SQL for risky changes.
- Restore from backup only as last resort.

Cutover rollback:

- Keep old app running read/write until new app is confirmed.
- Freeze window must have rollback decision point.
- If new app fails before final DNS switch, route users back to old app.

## Logging And Monitoring Strategy

Logs:

- Structured JSON.
- Include request id, route, status, duration, user id, organization id.
- Scrub secrets/tokens.

Metrics:

- Request latency/status.
- DB query latency.
- Queue depth.
- Job failures.
- SMS sent/failed/skipped.
- Payment callback success/failure.
- Upload/download volume.

Alerts:

- API unavailable.
- DB unavailable.
- Redis unavailable.
- High 5xx rate.
- Queue stuck.
- Payment callback failures.
- SMS provider failures.
- Storage errors.

## Health Checks

- `GET /health/live`: process responds.
- `GET /health/ready`: DB, Redis, storage reachable.
- `GET /health/deps`: admin-only dependency details.
- Worker health should expose queue connectivity and processor status.

## Deployment Checklist

- [ ] Env validated.
- [ ] Secrets present.
- [ ] Database backup complete.
- [ ] Migrations applied.
- [ ] API health passes.
- [ ] Worker connected to Redis.
- [ ] Web renders public and protected routes.
- [ ] Object storage upload/download passes.
- [ ] Public tracking leak test passes.
- [ ] Payment handoff/callback smoke passes.
- [ ] SMS dry-run or guarded live smoke passes.
- [ ] Error tracking receiving events.
- [ ] Logs visible.
- [ ] Rollback image identified.

## Future Enterprise Deployment Path

MVP:

- Docker Compose or simple container platform.
- One web container.
- One API container.
- One worker container.
- Managed PostgreSQL/Redis/object storage.

Scale-up:

- Horizontal API replicas.
- Multiple workers by queue.
- CDN for web/static assets.
- Dedicated read replica for reports.

Enterprise:

- Kubernetes.
- Ingress/Nginx.
- HPA autoscaling.
- Secrets manager.
- OpenTelemetry collector.
- Centralized logging.
- Network policies.
- Separate namespaces per environment.

## Decision Needed

- Decide target deployment platform for the rebuild MVP. Recommendation: Docker-ready first, deploy to the current preferred host only after staging proves parity.
- Decide object storage provider.
- Decide whether web and API are deployed separately or through one reverse proxy. Recommendation: separate services behind Nginx.

