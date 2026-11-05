# Imagem de produção da API (build a partir da raiz do monorepo)
FROM node:26-alpine AS build
WORKDIR /app
# Ferramentas de compilação para módulos nativos (bcrypt), caso não haja binário pré-compilado
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --workspace @alipe3d/shared --workspace @alipe3d/backend --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm run build -w @alipe3d/shared && npm run build -w @alipe3d/backend

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/backend/package.json /app/apps/backend/prisma.config.ts apps/backend/
COPY --from=build /app/apps/backend/prisma apps/backend/prisma
COPY --from=build /app/apps/backend/dist apps/backend/dist
WORKDIR /app/apps/backend
# Pasta de uploads gravável pelo usuário sem privilégios (montada como volume no compose)
RUN mkdir -p /app/apps/backend/uploads && chown node:node /app/apps/backend/uploads
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3333/api/v1/health/live || exit 1
# Aplica migrations pendentes, garante perfis/permissões (seed idempotente) e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/server.js"]
