FROM node:26.9.0-alpine@sha256:dbaa92e5758cbbcf85d65d5403fdb530fe3442cbe8c6dbfb7ef23365450d5070 AS ui-builder

# Node 25+ ships no corepack; pnpm comes from npm at the lockfile's version.
RUN mkdir /app \
    && npm install -g pnpm@11.25.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/

RUN apk add --update --no-cache g++ make git \
    && pnpm install --frozen-lockfile \
    && apk del g++ make

COPY . /app

RUN pnpm run build

FROM nginx:1.31.6-alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2
COPY  --from=ui-builder /app/dist /etc/nginx/html
COPY  --from=ui-builder /app/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx"]
