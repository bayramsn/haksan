# syntax=docker/dockerfile:1.7

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

WORKDIR /app
ENV CI=true
ENV NODE_OPTIONS=--max_old_space_size=1536

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci \
  --workspace @haksan/shared \
  --workspace @haksan/api \
  --workspace @haksan/web \
  --include-workspace-root

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Fırsat çalışma alanı arayüz seçici; yetki sınırı değil, yalnız hangi
# bileşenin render edileceğini belirler. Vite build anında gömülür.
ARG VITE_OPPORTUNITY_WORKSPACE_SIMPLE=legacy
ENV VITE_OPPORTUNITY_WORKSPACE_SIMPLE=${VITE_OPPORTUNITY_WORKSPACE_SIMPLE}
ARG VITE_OPPORTUNITY_WORKSPACE_PILOT_USERS=
ENV VITE_OPPORTUNITY_WORKSPACE_PILOT_USERS=${VITE_OPPORTUNITY_WORKSPACE_PILOT_USERS}

RUN npm run build:shared \
  && npm run build:api \
  && npm run build:web \
  && npm prune --omit=dev \
    --workspace @haksan/shared \
    --workspace @haksan/api \
    --include-workspace-root

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS api

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ARG API_RELEASE_ID=unknown
ARG BUILD_TIME=unknown
ENV API_RELEASE_ID=${API_RELEASE_ID}
ENV IMAGE_BUILD_TIME=${BUILD_TIME}

RUN apk add --no-cache font-dejavu postgresql-client

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/public/print ./apps/web/public/print
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "--workspace", "@haksan/api", "run", "start"]

FROM nginx:stable-alpine-slim@sha256:ddde39c6e51f02fde7410c2e9c234cf2d0a4c7bdbbe176aeb37d8ad7ab4eb58c AS nginx

COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
