FROM node:20-slim AS builder

WORKDIR /action

COPY package.json pnpm-lock.yaml  ./

RUN corepack enable
RUN pnpm install
COPY src ./src
COPY tsconfig.json ./
RUN pnpm build
RUN rm -rf node_modules
RUN pnpm install --frozen-lockfile --prod

# ---

FROM node:20-slim AS final

RUN apt update && apt install -y git

# Fix for GitHub Actions
# fatal: detected dubious ownership in repository at '/github/workspace'
# To add an exception for this directory, call:
RUN mkdir -p /github/workspace && git config --global --add safe.directory /github/workspace

WORKDIR /github/workspace

COPY --from=builder /action/package.json /action/package.json
COPY --from=builder /action/node_modules /action/node_modules
COPY --from=builder /action/dist /action/dist

CMD node /action/dist/main.js
