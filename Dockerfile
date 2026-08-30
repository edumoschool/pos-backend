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

# Copy only production dependencies
COPY --from=builder /app/package*.json ./
COPY prisma ./prisma/
RUN npm install --legacy-peer-deps --omit=dev
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