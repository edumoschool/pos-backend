# Building stage
FROM node:20-alpine AS builder

# Ensure devDependencies are installed regardless of platform-injected NODE_ENV
ENV NODE_ENV=development

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies for build)
RUN npm install --legacy-peer-deps

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Run build
RUN npm run build

# Production stage
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Copy only production dependencies. `prisma` is a devDependency but the CLI
# is needed at runtime for `migrate deploy`, so it is installed explicitly
# after the --omit=dev pass rather than pulling in the whole dev tree.
COPY --from=builder /app/package*.json ./
COPY prisma ./prisma/
# Prisma 7 reads the migration connection string from prisma.config.ts only
# (a `url` in the schema is rejected), so the config and its tsx runner must
# be present at runtime, not just at build time.
COPY prisma.config.ts ./
RUN npm install --legacy-peer-deps --omit=dev \
  && npm install --legacy-peer-deps --no-save \
     prisma@$(node -p "require('./package.json').devDependencies.prisma.replace(/^[^0-9]*/,'')")
RUN npx prisma generate

# Copy built assets
COPY --from=builder /app/dist ./dist

# curl is used by the container healthcheck
RUN apk add --no-cache curl

EXPOSE 7000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-7000}/api/docs" -o /dev/null || exit 1

# Apply pending migrations, then start. `migrate deploy` only ever applies
# migrations that have not run yet, so restarts are safe.
CMD [ "sh", "-c", "npx prisma migrate deploy && npm run start:prod" ]