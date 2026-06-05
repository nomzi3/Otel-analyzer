# Stage 1: build (copy src → dist)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 1337

CMD ["nginx", "-g", "daemon off;"]
