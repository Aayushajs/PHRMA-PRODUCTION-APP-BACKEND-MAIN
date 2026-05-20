# PERF-AUDIT-2026-05: 10.2 — pin Bun to a specific minor for reproducible
# builds and stable cold-start performance instead of floating `:latest`.
# ------------- BASE IMAGE WITH BUN + UBUNTU -------------
FROM oven/bun:1.1-debian

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

# PERF-AUDIT-2026-05: 10.3 — align EXPOSE with the actual listen port
# (server.ts defaults to 5001). Container orchestrators (compose, k8s) now
# advertise the correct port.
EXPOSE 5001

# Switch user
USER bun

# Lightweight container healthcheck — verifies the HTTP server is up.
# Backend keeps serving requests even when Redis is down (graceful degrade),
# so this intentionally does NOT depend on Redis connectivity.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:5001/').then(r => process.exit(r.ok || r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

# ------------- START APPLICATION -------------
# Run TypeScript directly with Bun. Bun resolves tsconfig "paths" natively,
# so we never end up with unresolved "@services/..." imports in production.
CMD ["bun", "run", "server.ts"]
