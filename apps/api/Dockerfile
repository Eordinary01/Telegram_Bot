# API & Worker runtime — runs the TypeScript monorepo services directly via tsx
# (the monorepo packages export TS source, so tsx is used as the production runtime).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install dependencies for native builds (e.g. prisma engines on alpine)
RUN apk add --no-cache python3 make g++
RUN corepack prepare pnpm@10.13.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Service to run: "api" or "worker" (passed at runtime via compose command)
ENV SERVICE=api

EXPOSE 3000

CMD pnpm --filter "@jecrc/${SERVICE}" exec tsx src/index.ts