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

COPY --from=builder /action/package.json /action/package.json
COPY --from=builder /action/node_modules /action/node_modules
COPY --from=builder /action/dist /action/dist

CMD node /action/dist/main.js
