# build stage
FROM node:22-alpine3.22 AS build-stage
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_NOTATION_URL
ENV VITE_NOTATION_URL=$VITE_NOTATION_URL
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
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
