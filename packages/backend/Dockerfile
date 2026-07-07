FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

# Make prisma binary executable
RUN chmod +x /app/node_modules/.bin/prisma

# Move to the backend directory where the schema is
WORKDIR /app/packages/backend

# Generate the Prisma client
RUN /app/node_modules/.bin/prisma generate

# (already in the backend directory, so the CMD will run from here)
EXPOSE 10000

CMD ["node", "server.js"]