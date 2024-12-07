# Use Node.js LTS (Long Term Support) as base image
FROM node:20-slim

# Install build essentials for node-llama-cpp
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create models directory
RUN mkdir -p models

# Note: The model file needs to be mounted or copied separately due to size
# You should mount it when running the container:
# docker run -v /path/to/model:/usr/src/app/models/meta-llama-3.1-8b-instruct-q4_k_m.gguf ...

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
