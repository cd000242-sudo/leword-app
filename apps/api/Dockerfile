# Build from the repository root:
# docker build -f apps/api/Dockerfile -t leword-mobile-api:latest .
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    HOME=/home/node \
    LEWORD_API_PORT=34983 \
    LEWORD_CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      curl \
      fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json tsconfig.electron.json ./
COPY src ./src
COPY apps/api ./apps/api
COPY apps/mobile/assets ./apps/mobile/assets

RUN find src apps/api/src -name '*.js' -delete

RUN npm ci --include=dev --ignore-scripts

RUN node -e "const fs=require('fs'); const dir='node_modules/electron'; fs.mkdirSync(dir,{recursive:true}); const src=['const userData=process.env.LEWORD_SERVER_USER_DATA || \\'/data\\';','module.exports={ app:{ getPath(){ return userData; }, isReady(){ return true; }, whenReady(){ return Promise.resolve(); }, getVersion(){ return process.env.npm_package_version || \\'0.0.0\\'; } }, safeStorage:{ isEncryptionAvailable(){ return false; }, encryptString(value){ return Buffer.from(String(value || \\'\\'),\\'utf8\\'); }, decryptString(value){ return Buffer.isBuffer(value) ? value.toString(\\'utf8\\') : String(value || \\'\\'); } }, shell:{ openExternal(){ return Promise.resolve(); }, showItemInFolder(){} }, Notification: class { show(){} }, BrowserWindow: class {} };']; fs.writeFileSync(dir+'/index.js', src.join('\\n'), 'utf8')"

RUN install -d -o node -g node /data /review /golden /briefing /searchad /quota \
    && chmod 700 /data /review /golden /briefing /searchad /quota

EXPOSE 34983

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:34983/health >/dev/null || exit 1

USER node

CMD ["npm", "--prefix", "apps/api", "run", "start:prod"]
