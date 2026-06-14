FROM node:20-slim AS base

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 5000

CMD ["npm", "start"]
