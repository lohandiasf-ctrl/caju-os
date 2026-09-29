FROM node:22-slim
WORKDIR /app
COPY package.json mapping.js index.js ./
ENV NODE_ENV=production
CMD ["node", "index.js"]
