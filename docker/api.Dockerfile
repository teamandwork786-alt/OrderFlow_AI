# Debian-based image on purpose: Alpine plus Prisma engines commonly fails on OpenSSL.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm install
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
