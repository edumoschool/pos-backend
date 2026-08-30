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
| `po.impulselc.uz` | the backend API |
| `s3.impulselc.uz` | MinIO S3 endpoint (image URLs) |
| `minio.impulselc.uz` | MinIO web console |

## 2. Create the resource

In Coolify: **New Resource → Docker Compose**, point it at this repository.

The file is named `docker-compose.yaml` at the repo root, and the resource's
"Docker Compose Location" field must match it exactly — including the
extension. Coolify treats `.yaml` and `.yml` as different paths and does not
fall back from one to the other, so a mismatch fails with either "Failed to
read the Docker Compose file from the repository" or "Docker Compose file not
found at: /docker-compose.yaml".

If you rename the file, update that field to match (or vice versa).

Set the branch to `master`.

## 3. Environment variables

### Set the six domain variables

In the resource's Environment Variables tab:

| Variable | Value | Used for |
|---|---|---|
| `SERVICE_FQDN_BACKEND_7000` | `po.impulselc.uz` | routing + TLS |
| `SERVICE_FQDN_MINIO_9000` | `s3.impulselc.uz` | routing + TLS |
| `SERVICE_FQDN_MINIO_9001` | `minio.impulselc.uz` | routing + TLS |
| `BACKEND_DOMAIN` | `po.impulselc.uz` | Telegram webhook URL |
| `MINIO_API_DOMAIN` | `s3.impulselc.uz` | `MINIO_SERVER_URL` |
| `MINIO_CONSOLE_DOMAIN` | `minio.impulselc.uz` | `MINIO_BROWSER_REDIRECT_URL` |

Hostname only — no `https://`, no trailing slash.

The `SERVICE_FQDN_*_<PORT>` keys drive routing: the `_<PORT>` suffix tells
Coolify which container port the domain maps to, and it generates the Traefik
configuration and certificate. That is why this compose file has no
`traefik.*` labels.

The plain `*_DOMAIN` keys are the same hostnames as values the app can read,
so it can build `https://…` URLs. They duplicate the FQDNs deliberately:
Coolify populates the matching `SERVICE_URL_*` keys only when it assigns the
domain itself, and they resolve to a blank string when you set the domains by
hand — which silently empties the webhook and MinIO URLs.

> **Delete any stale `SERVICE_*` entries.** Coolify keeps generated variables
> after the compose file stops referencing them, and will auto-assign
> `sslip.io` wildcard domains to them. If you see `SERVICE_FQDN_MINIO`,
> `SERVICE_URL_MINIOCONSOLE`, or any other name without a `_<PORT>` suffix,
> remove it — those are leftovers and nothing reads them.

### Also set this

| Variable | Example | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-...` | **required — get it from @BotFather** |

### Generated for you (leave blank)

| Variable | What it becomes |
|---|---|
| `SERVICE_USER_POSTGRES` / `SERVICE_PASSWORD_POSTGRES` | Postgres credentials |
| `SERVICE_USER_MINIO` / `SERVICE_PASSWORD_MINIO` | MinIO root creds + the app's S3 keys |
| `SERVICE_PASSWORD_JWT` | `JWT_SECRET` |

Coolify generates these once and keeps them stable across deploys.

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

- `https://po.impulselc.uz/api/docs` — Swagger UI
- `https://minio.impulselc.uz` — MinIO console, log in with the generated
  `SERVICE_USER_MINIO` / `SERVICE_PASSWORD_MINIO`
- Confirm the `pos-images` bucket exists after the backend's first boot

---

## Notes on the topology

- **Postgres publishes no ports.** It is reachable only as `postgres:5432` on
  the internal compose network. To connect a client, use a Coolify terminal or
  an SSH tunnel rather than opening the port.
- **The backend talks to MinIO internally** over `minio:9000` with
  `MINIO_USE_SSL=false`. Traffic never leaves the host, so TLS there would only
  add overhead. The public `s3.impulselc.uz` route is for clients fetching
  images.
- **`DATABASE_URL` and `DIRECT_URL` are identical.** Prisma reads the first at
  runtime through the pg adapter and the second for migrations. They would only
  diverge behind a connection pooler such as pgbouncer.
- **Startup ordering** is handled with `depends_on: condition: service_healthy`,
  so the backend waits for a genuinely ready database rather than a running
  container.
