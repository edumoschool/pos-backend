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

EXPOSE 7000

CMD [ "npm", "run", "start:prod" ]