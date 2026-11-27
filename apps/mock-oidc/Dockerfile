FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/analytics/package.json apps/analytics/package.json
COPY apps/mock-oidc/package.json apps/mock-oidc/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY . .
RUN npm run build --workspace @orderflow/mock-oidc

EXPOSE 4000
CMD ["npm", "run", "start", "--workspace", "@orderflow/mock-oidc"]
