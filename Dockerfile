# Note: build context is root of monorepo

FROM mhart/alpine-node:12 AS builder

WORKDIR /action

COPY package.json package-lock.json  ./

RUN npm install
COPY src ./src
COPY tsconfig.json ./
RUN npm run build
RUN npm prune --production

# ---

FROM mhart/alpine-node:slim-12 AS final

WORKDIR /action
COPY --from=builder /action .

CMD node ./lib/main.js
