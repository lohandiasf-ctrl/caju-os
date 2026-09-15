FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git ffmpeg
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
VOLUME /app/auth
EXPOSE 3300
CMD ["node", "index.js"]
