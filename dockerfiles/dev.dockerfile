FROM node:22.20-alpine AS dev

WORKDIR /app

COPY package.json .
COPY package-lock.json .

RUN npm ci

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
