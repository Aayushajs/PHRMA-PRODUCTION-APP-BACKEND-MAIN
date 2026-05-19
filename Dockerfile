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

# Install production deps only — Bun runs TypeScript natively, no tsc build step.
# This also avoids TS path-alias resolution issues that broke `dist/*.js`.
RUN bun install --frozen-lockfile --production

# ------------- COPY SOURCE CODE (excludes tests via .dockerignore) -----
COPY . .

# Create necessary folders
RUN mkdir -p /usr/src/app/temp_uploads

# Drop test sources from the image (kept tiny). All other .ts files are needed
# because Bun runs them directly at runtime — DO NOT delete them.
RUN rm -rf tests/

# Fix ownership
RUN chown -R bun:bun /usr/src/app

EXPOSE 5000

# Switch user
USER bun

# ------------- START APPLICATION -------------
# Run TypeScript directly with Bun. Bun resolves tsconfig "paths" natively,
# so we never end up with unresolved "@services/..." imports in production.
CMD ["bun", "run", "server.ts"]
