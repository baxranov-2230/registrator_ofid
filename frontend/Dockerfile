# Production image: build the bundle, then serve static files from nginx.
# Development still runs the Vite dev server via infra/docker-compose.yml.

FROM node:20-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer caches independently of source.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# tsc runs as part of `npm run build`, so a type error fails the image build
# instead of shipping a broken bundle (A-01 went unnoticed precisely because
# nothing ever built the frontend in CI or in Docker).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build


FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.spa.conf /etc/nginx/conf.d/default.conf

# nginx:alpine ships an unprivileged 'nginx' user; give it the dirs it needs.
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /usr/share/nginx/html

USER nginx

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget --spider -q http://127.0.0.1:8080/ || exit 1
