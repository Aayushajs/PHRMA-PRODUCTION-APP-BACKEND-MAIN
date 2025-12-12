# Use official bun image (includes bun runtime)
FROM oven/bun:latest

# Install Tesseract and english language pack
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      tesseract-ocr \
      tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package.json only (don't require bun.lockb)
COPY package.json ./

# Install deps with bun
RUN bun install --production

# Copy rest of project
COPY . .

# Create app user 'bunbun', temp dir and set ownership
RUN useradd --create-home --shell /bin/bash bunbun \
 && mkdir -p /usr/src/app/temp_uploads \
 && chown -R bunbun:bunbun /usr/src/app/temp_uploads

# Optional: print tesseract version to build logs
RUN tesseract -v || true

EXPOSE 4000

# Switch to the non-root 'bunbun' user
USER bunbun

CMD ["bun", "run", "server.ts"]
