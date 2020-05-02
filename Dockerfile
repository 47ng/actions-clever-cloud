FROM mhart/alpine-node:14 AS builder

WORKDIR /action

COPY package.json yarn.lock  ./

RUN yarn
COPY src ./src
COPY tsconfig.json ./
RUN yarn build
RUN rm -rf node_modules
RUN yarn install --production

# ---

FROM mhart/alpine-node:14 AS final

WORKDIR /action
COPY --from=builder /action .

CMD node /action/dist/main.js
