FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

WORKDIR /app/packages/backend

RUN npx prisma generate

EXPOSE 10000

CMD ["node", "server.js"]