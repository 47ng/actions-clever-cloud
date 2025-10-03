FROM node:24.9.0-slim AS builder

WORKDIR /action

COPY package.json pnpm-lock.yaml  ./

RUN corepack enable
RUN pnpm install --frozen-lockfile --production
COPY src ./src

# ---

FROM node:24.9.0-slim AS final

RUN apt update && apt install -y git

# Provide defaults for boolean inputs so the parser doesn't complain
ENV INPUT_QUIET=false
ENV INPUT_FORCE=false

COPY --from=builder /action/package.json /action/package.json
COPY --from=builder /action/node_modules /action/node_modules
COPY --from=builder /action/src /action/src

CMD ["node", "/action/src/main.ts"]
