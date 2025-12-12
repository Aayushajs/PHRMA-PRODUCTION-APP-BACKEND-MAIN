# ------------- BASE IMAGE WITH BUN + UBUNTU -------------
FROM oven/bun:latest

# ------------- INSTALL TESSERACT -------------
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      tesseract-ocr \
      tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# ------------- COPY DEPENDENCY FILES -------------
COPY package.json bun.lock ./

# Install all dependencies (including devDeps for build)
RUN bun install

# ------------- COPY SOURCE CODE -------------
COPY . .

# ------------- BUILD TYPESCRIPT -------------
RUN bun run build   # must generate dist/

# Create necessary folder
RUN mkdir -p /usr/src/app/temp_uploads

# Fix ownership (optional)
RUN chown -R bun:bun /usr/src/app

EXPOSE 5000

# Switch user
USER bun

# ------------- START APPLICATION -------------
CMD ["bun", "run", "dist/server.js"]
