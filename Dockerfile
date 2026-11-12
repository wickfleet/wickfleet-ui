# The bundle is plain JS and CSS: build it once on the runner, not under arm64 emulation.
FROM --platform=$BUILDPLATFORM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS ui-builder

# Node 25+ ships no corepack; pnpm comes from npm at the lockfile's version.
RUN mkdir /app \
    && npm install -g pnpm@12.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/

RUN apk add --update --no-cache g++ make git \
    && pnpm install --frozen-lockfile \
    && apk del g++ make

COPY . /app

RUN pnpm run build

FROM nginx:1.31.7-alpine@sha256:892bb2152464f0c5d8972593a5f5afaf8054552580b699d95f8ff4af08c2d33d
COPY  --from=ui-builder /app/dist /etc/nginx/html
COPY  --from=ui-builder /app/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx"]
