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

# ------------- COPY DEPENDENCY FILES ONLY (for caching) -----------
COPY package.json bun.lock ./

# Install dependencies (including devDeps for TypeScript build)
RUN bun install --frozen-lockfile

# ------------- COPY SOURCE CODE (excludes tests via .dockerignore) -----
COPY . .

# ------------- BUILD TYPESCRIPT (excludes test files via tsconfig) -----
RUN bun run build:prod

# Create necessary folders
RUN mkdir -p /usr/src/app/temp_uploads

# Remove development dependencies to reduce image size
RUN bun install --production --no-save

# Remove source files, keep only compiled JavaScript
RUN rm -rf \
    server.ts \
    *.ts \
    Services/ \
    Middlewares/ \
    Routers/ \
    Databases/ \
    Utils/ \
    config/ \
    tests/ \
    types/ \
    scripts/

# Fix ownership (optional)
RUN chown -R bun:bun /usr/src/app

EXPOSE 5000

# Switch user
USER bun

# ------------- START APPLICATION -------------
CMD ["bun", "run", "dist/server.js"]
