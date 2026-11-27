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
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace @orderflow/web

EXPOSE 4173
CMD ["npm", "run", "preview", "--workspace", "@orderflow/web", "--", "--port", "4173"]
