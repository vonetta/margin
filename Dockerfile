FROM ghcr.io/puppeteer/puppeteer:25.1.0

# The base image's Chrome + all required shared libraries (libnss3, libatk,
# libgbm, etc.) are already installed — this is what avoids the "missing
# library" crash that plain node:slim + npm install puppeteer runs into on
# Railway's default environment.

USER root
WORKDIR /app

# The image already has a matching Chrome build cached for this puppeteer
# version — skip npm's own download so install doesn't fetch a second copy
# or risk a version mismatch with what's baked into the image.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN chown -R pptruser:pptruser /app

USER pptruser

ENV NODE_ENV=production

CMD ["node", "src/app.js"]
