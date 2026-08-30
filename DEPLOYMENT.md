# Deploying pos-backend on Coolify

Stack: **pos-backend** (NestJS) + **PostgreSQL 16** + **MinIO**.

Redis is not included — nothing in the codebase uses it. Cron jobs run
in-process through `@nestjs/schedule`. Add it when you introduce BullMQ or
caching; it is a new service in the compose file plus one env var.

---

## 1. DNS

Point three A records at the Coolify host before deploying, or TLS issuance
will fail:

| Record | Purpose |
|---|---|
| `api.example.com` | the backend API |
| `s3.example.com` | MinIO S3 endpoint |
| `console.example.com` | MinIO web console |

## 2. Create the resource

In Coolify: **New Resource → Docker Compose**, point it at this repository and
set the compose file to `docker-compose.coolify.yml`.

## 3. Environment variables

Coolify auto-generates the `SERVICE_*` variables — leave them blank and it
fills them in on first deploy. **Set the rest yourself** in the resource's
Environment Variables tab.

### Generated for you (do not set)

| Variable | What it becomes |
|---|---|
| `SERVICE_USER_POSTGRES` / `SERVICE_PASSWORD_POSTGRES` | Postgres credentials |
| `SERVICE_USER_MINIO` / `SERVICE_PASSWORD_MINIO` | MinIO root creds + the app's S3 keys |
| `SERVICE_PASSWORD_JWT` | `JWT_SECRET` |
| `SERVICE_FQDN_BACKEND` | public backend URL, also the Telegram webhook domain |
| `SERVICE_FQDN_MINIO` / `SERVICE_FQDN_MINIOCONSOLE` | MinIO public URLs |

### You must set these

| Variable | Example | Notes |
|---|---|---|
| `BACKEND_DOMAIN` | `api.example.com` | hostname only, no scheme |
| `MINIO_DOMAIN` | `s3.example.com` | hostname only |
| `MINIO_CONSOLE_DOMAIN` | `console.example.com` | hostname only |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-...` | **required — the app will not boot without it** |

### Optional

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_DB` | `pos` | |
| `MINIO_BUCKET` | `pos-images` | created automatically on first boot |
| `JWT_EXPIRES_IN` | `7d` | |
| `EXPO_ACCESS_TOKEN` | *(empty)* | only needed for push notifications |

> `TELEGRAM_BOT_TOKEN` and every `MINIO_*` value are read with
> `ConfigService.getOrThrow`, so a missing one crashes the container at
> startup rather than degrading. That is why they have no defaults here.

---

## 4. Database migrations

The container runs `prisma migrate deploy` before starting the app. It only
applies migrations that have not run yet, so restarts and redeploys are safe.

### Fresh database

Nothing to do. The baseline migration creates all 23 tables, 10 enums,
35 indexes and 44 foreign keys on the first deploy.

### Existing database (important)

Your current database was built with `prisma db push`, so the tables already
exist but Prisma has no migration history for them. A first `migrate deploy`
against it **will fail** — it tries to create tables that are already there.

Mark the baseline as already-applied once, against that database:

```bash
DATABASE_URL='<prod url>' DIRECT_URL='<prod url>' \
  npx prisma migrate resolve --applied 00000000000000_baseline
```

or, from inside the running container:

```bash
npx prisma migrate resolve --applied 00000000000000_baseline
```

This only writes a row to `_prisma_migrations`; it does not touch your data.
After that, `migrate deploy` is a no-op until you add a new migration.

> Verify the baseline matches your live schema before running this. It was
> generated from `prisma/schema.prisma` and includes the 29 indexes added
> recently — if the live database predates those, apply them separately or let
> a follow-up migration add them.

### Adding a schema change later

```bash
npx prisma migrate dev --name add_something   # locally, creates the migration
git commit && push                             # deploy applies it automatically
```

Stop using `prisma db push` against production once migrations are in play —
mixing the two is what creates drift.

---

## 5. Verify

- `https://api.example.com/api/docs` — Swagger UI
- `https://console.example.com` — MinIO console, log in with the generated
  `SERVICE_USER_MINIO` / `SERVICE_PASSWORD_MINIO`
- Confirm the `pos-images` bucket exists after the backend's first boot

---

## Notes on the topology

- **Postgres publishes no ports.** It is reachable only as `postgres:5432` on
  the internal compose network. To connect a client, use a Coolify terminal or
  an SSH tunnel rather than opening the port.
- **The backend talks to MinIO internally** over `minio:9000` with
  `MINIO_USE_SSL=false`. Traffic never leaves the host, so TLS there would only
  add overhead. The public `s3.example.com` route is for clients fetching
  images.
- **`DATABASE_URL` and `DIRECT_URL` are identical.** Prisma reads the first at
  runtime through the pg adapter and the second for migrations. They would only
  diverge behind a connection pooler such as pgbouncer.
- **Startup ordering** is handled with `depends_on: condition: service_healthy`,
  so the backend waits for a genuinely ready database rather than a running
  container.
