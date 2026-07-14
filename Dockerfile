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
COPY package*.json ./
RUN npm ci --no-audit --fund=false
COPY . .
RUN npm run build

# production stage
FROM nginx:1.29-alpine3.22 AS production-stage
LABEL org.opencontainers.image.authors="Nikolay Groznykh <nikolay@groznykh.ru>"
RUN apk upgrade --no-cache
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY config/default.conf /etc/nginx/conf.d/default.conf
RUN chown -R 101:101 /usr/share/nginx/html /var/cache/nginx /var/run /etc/nginx/conf.d
USER 101
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
