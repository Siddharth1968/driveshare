FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build -w apps/api
WORKDIR /app/apps/api
RUN mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate && if [ \"$DEMO_MODE\" = \"true\" ] && [ \"$NODE_ENV\" != \"production\" ]; then npm run db:seed; fi && node dist/server.js"]
