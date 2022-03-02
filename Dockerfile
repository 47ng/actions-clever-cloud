FROM node:16-bullseye AS builder

WORKDIR /action

COPY package.json yarn.lock  ./

RUN yarn
COPY src ./src
COPY tsconfig.json ./
RUN yarn build
RUN rm -rf node_modules
RUN yarn install --production

# ---

FROM node:16-bullseye AS final

COPY --from=builder /action /action

CMD node /action/dist/main.js
