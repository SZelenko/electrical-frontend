# syntax=docker/dockerfile:1
# Build context is the frontend/ root:  docker build -f kube/Dockerfile --target dev .

# ---------- dev: Vite dev server, code and node_modules live in the host mount (hostPath) ----------
FROM node:24-bookworm-slim AS dev

ARG APP_UID=1000
ARG APP_GID=1000

# The node image already ships user/group `node` with uid/gid 1000: reuse it and only
# re-number it when the requested ids differ, so hostPath files keep the host owner.
RUN apt-get update \
 && apt-get install -y --no-install-recommends make \
 && rm -rf /var/lib/apt/lists/* \
 && groupmod -g ${APP_GID} node \
 && usermod -u ${APP_UID} -g ${APP_GID} node \
 && mkdir -p /var/www/app \
 && chown -R ${APP_UID}:${APP_GID} /home/node /var/www/app

WORKDIR /var/www/app

USER node

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------- build: static bundle ----------
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Public build-time config only (VITE_*); pass with --build-arg VITE_API_URL=...
ARG VITE_API_URL
RUN npm run build

# ---------- prod: dist/ served by unprivileged nginx (non-root, port 8080) ----------
FROM nginxinc/nginx-unprivileged:1.30-alpine AS prod

COPY kube/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
