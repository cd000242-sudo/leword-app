# Build from the repository root:
# docker build -f apps/api/Dockerfile -t leword-mobile-api:latest .
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    LEWORD_API_PORT=34983 \
    LEWORD_CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json tsconfig.electron.json ./
COPY src ./src
COPY apps/api ./apps/api

RUN npm ci --include=dev --ignore-scripts

EXPOSE 34983

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port=process.env.LEWORD_API_PORT||34983; fetch('http://127.0.0.1:'+port+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "--prefix", "apps/api", "run", "start:prod"]
