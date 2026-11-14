FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts
COPY apps/web apps/web
ARG VITE_TILE_URL=""
ARG VITE_TILE_ATTRIBUTION=""
ENV VITE_TILE_URL=$VITE_TILE_URL
ENV VITE_TILE_ATTRIBUTION=$VITE_TILE_ATTRIBUTION
RUN npm run build -w apps/web
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
