# Use a lightweight Node.js Debian image
FROM node:20-bullseye-slim

# Install Ghostscript at the OS level
RUN apt-get update && apt-get install -y ghostscript && rm -rf /var/lib/apt/lists/*

# Set up the app directory
WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your app code
COPY . .

# Expose the port your Express app uses
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
