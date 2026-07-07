# Use a Node.js image that matches Render's environment
FROM node:22-slim

# Install OpenSSL (required by Prisma on Linux)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy the entire monorepo (needed for workspace dependencies)
COPY . .

# Install all workspace dependencies from the root
RUN npm install

# Move to the backend package
WORKDIR /app/packages/backend

# Generate the Prisma client (now inside the correct Linux environment)
RUN npx prisma generate

# Expose the port Render will use (default is 10000, but we use the PORT env variable)
EXPOSE 10000

# Start the server
CMD ["node", "server.js"]