FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

# Now the prisma binary is at /app/node_modules/.bin/prisma
RUN /app/node_modules/.bin/prisma generate

# Switch to the backend package for the runtime
WORKDIR /app/packages/backend

EXPOSE 10000

CMD ["node", "server.js"]