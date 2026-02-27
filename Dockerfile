FROM node:20-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./

# DEV
FROM base AS dev
RUN npm install
COPY . .
CMD [ "npm", "run", "dev" ]

# PROD
FROM base AS prod
RUN npm install --production --omit=dev
COPY . .
CMD [ "npm", "start" ]