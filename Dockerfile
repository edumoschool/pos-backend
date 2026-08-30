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

# Install production dependencies only. The Prisma CLI is deliberately not
# installed here: schema changes are pushed manually with `prisma db push`
# from a developer machine, so the container only ever runs the app. The
# generated client is copied from the builder below.
COPY --from=builder /app/package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

# Copy built assets
COPY --from=builder /app/dist ./dist

# curl is used by the container healthcheck
RUN apk add --no-cache curl

EXPOSE 7000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-7000}/api/docs" -o /dev/null || exit 1

# Start the app. No schema step runs here: `prisma db push` is run manually
# against the database before deploying a schema change.
CMD [ "npm", "run", "start:prod" ]
