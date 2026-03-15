# Biteline Voice Server Dockerfile
# Build: podman build -t biteline-voice .
# Run:   podman-compose up (preferred — includes Redis)

FROM docker.io/node:22-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Non-root user for security
RUN addgroup -S biteline && adduser -S -G biteline biteline
USER biteline

EXPOSE 6501

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:6501/health || exit 1

CMD ["node", "index.js"]
