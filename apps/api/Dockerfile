# API Keyo (NestJS) en développement : relais sécurisé vers Claude pour l'agent.
# Construire depuis la racine du dépôt : docker-compose build api
FROM node:22-alpine

RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/
RUN CI=1 pnpm install --frozen-lockfile --filter "@keyo/api..."

COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /repo/apps/api
EXPOSE 3000
# Variables (ANTHROPIC_API_KEY…) fournies par docker-compose via apps/api/.env.
CMD ["npx", "tsx", "watch", "src/main.ts"]
