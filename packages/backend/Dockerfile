FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

# Make prisma binary executable (required when built on Windows)
RUN chmod +x /app/node_modules/.bin/prisma

# Generate the Prisma client
RUN /app/node_modules/.bin/prisma generate

# Switch to the backend package for the runtime
WORKDIR /app/packages/backend

EXPOSE 10000

CMD ["node", "server.js"]