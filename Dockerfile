FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /app/data && chown -R node:node /app
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/mdp.sqlite
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
