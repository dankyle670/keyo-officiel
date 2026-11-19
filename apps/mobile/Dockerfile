# Serveur de développement Expo (Metro) dans un conteneur.
# L'app elle-même tourne sur le téléphone (Expo Go) : le conteneur ne sert que le bundle JavaScript.
# Construire depuis la racine du dépôt : docker compose build mobile
FROM node:22-alpine

ENV CI=1 \
    EXPO_NO_TELEMETRY=1
RUN corepack enable
WORKDIR /repo

# Manifestes d'abord, pour profiter du cache Docker tant que les dépendances ne changent pas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps/mobile apps/mobile
COPY docs/design/tokens.json docs/design/tokens.json

WORKDIR /repo/apps/mobile
EXPOSE 8081
# --go : cible Expo Go (sinon Expo attend un development build, car expo-dev-client est installé).
CMD ["sh", "-c", "npx expo start --go --lan --port 8081"]
