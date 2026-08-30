# Deploying pos-backend on Coolify

Three resources, created separately in Coolify:

1. **PostgreSQL 16** — database
2. **MinIO** — object storage for product images
3. **pos-backend** — this repository, built from the `Dockerfile`

Redis is not included — nothing in the codebase uses it. Cron jobs run
in-process through `@nestjs/schedule`.

Create them in that order: the backend needs connection details from the other
two.

---

## 1. PostgreSQL

Coolify has a one-click PostgreSQL resource. Create it, pick version 16, and
note the credentials it generates.

Do **not** expose it publicly. The backend reaches it over Coolify's internal
network.

From the resource's page, copy the **internal** connection string. It looks
like:

```
postgresql://postgres:<password>@<service-name>:5432/postgres
```

That value is `DATABASE_URL` and `DIRECT_URL` for the backend.

## 2. MinIO

Coolify removed its one-click MinIO template, so deploy it from the compose
file in this repo: [`deploy/minio/docker-compose.yaml`](deploy/minio/docker-compose.yaml).

In Coolify: **New Resource -> Docker Compose**, and paste that file's contents.

Two ports are published, each on its own domain:

| Port | Purpose | Domain |
|---|---|---|
| 9000 | S3 API — what the backend and image URLs use | `s3.impulselc.uz` |
| 9001 | Web console | `minio.impulselc.uz` |

Set these in the resource's Environment Variables tab:

| Variable | Value |
|---|---|
| `SERVICE_FQDN_MINIO_9000` | `s3.impulselc.uz` |
| `SERVICE_FQDN_MINIO_9001` | `minio.impulselc.uz` |
| `MINIO_API_DOMAIN` | `s3.impulselc.uz` |
| `MINIO_CONSOLE_DOMAIN` | `minio.impulselc.uz` |
| `MINIO_ROOT_USER` | an access key you choose — becomes the backend's `MINIO_ACCESS_KEY` |
| `MINIO_ROOT_PASSWORD` | a long random secret (min 8 chars) — becomes `MINIO_SECRET_KEY` |

The `SERVICE_FQDN_*` keys drive Traefik routing and certificates; the plain
`*_DOMAIN` keys are the same hostnames as values MinIO itself reads to build
redirect and presigned URLs.

The compose file declares a named volume at `/data`, so object data survives
redeploys.

### Create the bucket

After MinIO is up, open `https://minio.impulselc.uz`, sign in with the root
credentials, and create a bucket named **`pos-images`** (or whatever you set as
the backend's `MINIO_BUCKET`).

> The backend also creates the bucket on boot if it is missing, so this step is
> belt-and-braces. Creating it by hand first lets you set an access policy —
> objects are private by default, which means image URLs only work as presigned
> links.

> Do not add a custom healthcheck command. The `minio/minio` image ships
> neither `curl`, `wget`, nor `mc`, so a shell-based probe fails instantly and
> the container is marked unhealthy about a second after starting. The compose
> file deliberately defines none; the image carries its own.

## 3. pos-backend

Create a resource of type **Dockerfile** (not Docker Compose) pointing at this
repository, branch `master`. Coolify builds the `Dockerfile` at the repo root.

- **Port**: 7000
- **Domain**: `po.impulselc.uz`

### Environment variables

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `7000` |
| `DATABASE_URL` | internal Postgres URL from step 1 |
| `DIRECT_URL` | same value as `DATABASE_URL` |
| `JWT_SECRET` | a long random string — see below |
| `JWT_EXPIRES_IN` | `7d` |
| `MINIO_ENDPOINT` | `s3.impulselc.uz` |
| `MINIO_PORT` | `443` |
| `MINIO_USE_SSL` | `true` |
| `MINIO_ACCESS_KEY` | MinIO's `MINIO_ROOT_USER` |
| `MINIO_SECRET_KEY` | MinIO's `MINIO_ROOT_PASSWORD` |
| `MINIO_BUCKET` | `pos-images` — must match the bucket from step 2 |
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_WEBHOOK_DOMAIN` | `https://po.impulselc.uz` |
| `EXPO_ACCESS_TOKEN` | optional, only for push notifications |

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```

> **Every `MINIO_*` value and `TELEGRAM_BOT_TOKEN` are read with
> `ConfigService.getOrThrow`.** A missing one stops the app at startup rather
> than degrading. Note that an *empty* string passes `getOrThrow`, so a blank
> `TELEGRAM_BOT_TOKEN` gets past config and then fails inside Telegraf with a
> less obvious error.

> The backend reaches MinIO over its public domain, because separate Coolify
> resources do not share a Docker network by default. That means TLS on port
> 443, not plain HTTP on 9000 — `MINIO_PORT: 443` and `MINIO_USE_SSL: true`
> must be set together or the client fails to connect. Uploads therefore leave
> the host and come back through Traefik; if that overhead matters later, put
> both resources on Coolify's predefined network and switch back to the
> internal service name with port 9000 and SSL off.

---

## 4. DNS

Point these at the Coolify host before deploying, or TLS issuance fails:

| Record | Resource |
|---|---|
| `po.impulselc.uz` | backend |
| `s3.impulselc.uz` | MinIO port 9000 |
| `minio.impulselc.uz` | MinIO port 9001 |

---

## 5. Database schema

Schema changes are applied **manually**, not on deploy. The container only
starts the app; it carries no Prisma CLI and no `prisma.config.ts`.

There is no migration history in this project — `prisma/schema.prisma` is the
single source of truth, pushed directly with `prisma db push`.

### Applying a schema change

Point `DIRECT_URL` at the production database and push from your machine
before deploying the code that depends on it:

```bash
npx prisma db push      # or: npm run db:push
```

`db push` diffs the schema against the live database and applies only the
difference, so it is safe to re-run.

> **Destructive changes.** If a change drops or narrows a column, `db push`
> asks for confirmation before discarding data. Running it locally means you
> get that prompt and can answer it — the reason this step is not automated.

### Order of operations

Push the schema first, then deploy. The running app expects the columns its
generated client references, so deploying code ahead of the schema breaks
queries until the push lands.

---

## 6. Verify

- `https://po.impulselc.uz/api/docs` — Swagger UI
- `https://minio.impulselc.uz` — MinIO console
- Confirm the `pos-images` bucket exists in the MinIO console

---

## Notes

- **Start order.** The backend retries its MinIO bucket check ten times with a
  3s backoff, so MinIO starting slowly is tolerated. Postgres is not retried
  in the same way, so bring the database up before the backend.
- **`DATABASE_URL` and `DIRECT_URL` are identical.** Prisma reads the first at
  runtime through the pg adapter and the second by `prisma.config.ts` for
  manual schema pushes. They would only differ behind a connection pooler
  such as pgbouncer.
- **No Prisma CLI in the production image.** The runtime stage installs only
  production dependencies. The generated client is compiled into `dist/` by
  the builder and reaches the database through `@prisma/adapter-pg`, so the
  app needs neither the CLI nor `prisma.config.ts` to run.
