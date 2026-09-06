# syntax=docker/dockerfile:1.7

FROM node:22.16.0-bookworm-slim AS dependencies
WORKDIR /opt/bu2/sandbox
COPY sandbox/package.json sandbox/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22.16.0-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="BU2 Reference Server" \
      org.opencontainers.image.description="BU2 ENV-04/05/06 shared immutable runtime artifact" \
      org.opencontainers.image.source="https://github.com/atxinbao/bu2com"

# 同一制品内预建两个非特权身份；部署单元只能选择与环境对应的 UID/GID。
RUN groupadd --gid 10001 bu2sandbox \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin bu2sandbox \
    && groupadd --gid 10002 bu2live \
    && useradd --uid 10002 --gid 10002 --no-create-home --shell /usr/sbin/nologin bu2live \
    && mkdir -p /var/lib/bu2/sandbox /var/lib/bu2/live \
    && chown 10001:10001 /var/lib/bu2/sandbox \
    && chown 10002:10002 /var/lib/bu2/live

WORKDIR /opt/bu2
COPY --from=dependencies /opt/bu2/sandbox/node_modules ./sandbox/node_modules
COPY sandbox ./sandbox
COPY docs/03-technical/environment-contract.json ./docs/03-technical/environment-contract.json
COPY docs/03-technical/contract-versions.json ./docs/03-technical/contract-versions.json
COPY docs/03-technical/access-contract.json ./docs/03-technical/access-contract.json

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "sandbox/server.mjs"]
