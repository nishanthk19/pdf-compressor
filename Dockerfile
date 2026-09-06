FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript ocrmypdf qpdf \
    && rm -rf /var/lib/apt/lists/*

RUN npm ci

COPY . .

RUN npm run build \
    && npm prune --omit=dev

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma db push && node server.js"]
