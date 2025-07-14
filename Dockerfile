# 1. Use the official Playwright Docker image
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json first (for caching npm install)
COPY package*.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy the rest of your application files
COPY . .

# 6. Expose the port your app uses (adjust if needed)
EXPOSE 10000

# 7. Command to run the app
CMD ["node", "index.js"]