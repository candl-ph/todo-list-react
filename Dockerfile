# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BASE_PATH=
ENV SKIP_TYPECHECK=true
ENV CI=1

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=todolizt-npm \
    npm ci --legacy-peer-deps --no-audit --no-fund --cache /root/.npm

COPY next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts

RUN --mount=type=cache,target=/app/.next/cache,id=todolizt-next \
    npx next build

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib/password.mjs ./src/lib/password.mjs
COPY --from=build /app/src/lib/api-token.mjs ./src/lib/api-token.mjs

EXPOSE 3000

CMD ["node", "server.js"]
