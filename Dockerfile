# build stage
FROM node:lts-alpine AS build-stage
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_NOTATION_URL
ENV VITE_NOTATION_URL=$VITE_NOTATION_URL
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# production stage
FROM nginx:stable-alpine AS production-stage
LABEL org.opencontainers.image.authors="Nikolay Groznykh <nikolay@groznykh.ru>"
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY config/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]