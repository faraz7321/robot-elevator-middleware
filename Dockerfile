# Step 1: Build the NestJS app using Node.js
FROM node:20 AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build


# Step 2: Run the compiled code in a smaller, production-only container
FROM node:20-alpine

WORKDIR /app

# Copy only necessary artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Expose the port your NestJS app runs on
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
