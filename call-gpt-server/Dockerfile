FROM node:18.9.0-slim AS builder
RUN apt-get update -qq && apt-get install -y build-essential pkg-config python-is-python3
WORKDIR /app
RUN npm install -g esbuild
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_ENV="production"
RUN esbuild app.js --bundle --platform=node --outfile=dist/app.js

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist/app.js .
CMD ["node", "app.js"]