FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY server.js knowledge.js ./
COPY public ./public

USER node
EXPOSE 3000

CMD ["npm", "start"]
