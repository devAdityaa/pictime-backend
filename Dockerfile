FROM node:20-alpine

WORKDIR /usr/src/app

# Install deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy app code
COPY . .

# Cloud Run will set PORT env var, but we default to 8080
ENV PORT=8080

CMD ["node", "index.mjs"]
