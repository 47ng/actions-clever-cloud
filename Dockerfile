FROM node:26.13.0-slim AS builder

# Note: when updating things that go into this Docker image (with COPY or RUN),
# make sure to update the allow-list in the .github/workflows/pr-preview.yml
# workflow `on.pull_request.paths` section, so it gets rebuilt when needed.

WORKDIR /action

COPY package.json pnpm-lock.yaml ./

RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY src ./src
COPY tsconfig.json ./
RUN pnpm build
RUN rm -rf node_modules
RUN pnpm install --frozen-lockfile --ignore-scripts --production

# ---

FROM node:26.13.0-slim AS final

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

# Provide defaults for boolean inputs so the parser doesn't complain
ENV INPUT_QUIET=false
ENV INPUT_GITHOOKS=false
ENV INPUT_FORCE=false

COPY --from=builder /action/package.json /action/package.json
COPY --from=builder /action/node_modules /action/node_modules
COPY --from=builder /action/dist /action/dist

CMD ["node", "/action/dist/main.js"]
