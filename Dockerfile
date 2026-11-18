FROM node:24-bookworm-slim
WORKDIR /srv/finance
COPY app/package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node app/ ./
RUN chown node:node /srv/finance
USER node
ENV ACCT_USE_LOCAL_SUBSCRIPTION=0
CMD ["node", "render-demo.mjs"]
