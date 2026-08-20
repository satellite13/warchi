# build stage
FROM node:22-alpine3.22 AS build-stage
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_NOTATION_URL
ENV VITE_NOTATION_URL=$VITE_NOTATION_URL
ARG VITE_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ARG VITE_SITE_RETURN_ORIGINS
ENV VITE_SITE_RETURN_ORIGINS=$VITE_SITE_RETURN_ORIGINS
ARG APP_VERSION
ENV VITE_APP_VERSION=$APP_VERSION
WORKDIR /app
# Supports package.json "file:../papirus" via: docker build --build-context papirus=../papirus
COPY --from=papirus . /papirus
COPY package*.json ./
# A local file dependency resolves through its prebuilt dist/. Rebuild it inside
# the image so source edits cannot be silently replaced by a stale bundle.
RUN if node -e "const d=require('./package.json').dependencies['@ngroznykh/papirus']; process.exit(d?.startsWith('file:') ? 0 : 1)"; then \
      cd /papirus && npm ci --no-audit --fund=false && npm run build; \
    fi
RUN npm ci --no-audit --fund=false
COPY . .
RUN npm run build

# production stage
FROM nginx:1.29-alpine3.22 AS production-stage
LABEL org.opencontainers.image.authors="Nikolay Groznykh <nikolay@groznykh.ru>"
RUN apk upgrade --no-cache \
  && apk add --no-cache openssl \
  && mkdir -p /etc/nginx/certs \
  && openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/certs/tls.key \
    -out /etc/nginx/certs/tls.crt \
    -subj "/CN=warchi.arch.svc.cluster.local" \
    -addext "subjectAltName=DNS:warchi.arch.svc.cluster.local,DNS:warchi-site.arch.svc.cluster.local,DNS:localhost"
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY config/default.conf /etc/nginx/conf.d/default.conf
# Non-root + readOnlyRootFilesystem: pid/cache live on emptyDir mounts (/var/run, /var/cache/nginx).
RUN chown -R 101:101 /usr/share/nginx/html /var/cache/nginx /var/run /etc/nginx/conf.d /etc/nginx/certs
USER 101
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
