FROM oven/bun:debian AS build-base
RUN apt-get update && apt-get install -y --no-install-recommends jq ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM oven/bun:debian AS run-base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl jq unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Step 1: Install dependencies only when needed
FROM build-base AS pruner
WORKDIR /app
COPY --chown=node:node . .
RUN bun add turbo --global
RUN turbo prune server --docker

# Step 2: Rebuild the source code only when needed
FROM build-base AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/full/ .

RUN bun install

# Step 3: Production image, copy all the files and run next
FROM run-base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid 1001 server

COPY --from=builder /app/apps/server ./apps/server
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
RUN chown -R server:nodejs /app/node_modules/.bun

USER server

EXPOSE 9000

CMD ["bun", "run", "./apps/server/src/index.ts"]
