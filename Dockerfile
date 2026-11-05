FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 TZ=Africa/Lagos DATABASE_PATH=/var/lib/teamfare/teamfare.sqlite
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src/data.ts ./src/data.ts
COPY --from=build --chown=node:node /app/src/research.ts ./src/research.ts
COPY --from=build --chown=node:node /app/src/identity.ts ./src/identity.ts
COPY --from=build --chown=node:node /app/server ./server
RUN mkdir -p /var/lib/teamfare && chown node:node /var/lib/teamfare && chmod 700 /var/lib/teamfare
USER node
EXPOSE 3001
CMD ["node", "server/index.ts"]
