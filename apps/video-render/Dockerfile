# VELTRO Remotion render worker — headless Chromium + ffmpeg
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y \
    ffmpeg chromium fonts-liberation libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
  && rm -rf /var/lib/apt/lists/*
ENV REMOTION_CHROME_MODE=chrome-for-testing
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
CMD ["npm", "run", "worker"]
