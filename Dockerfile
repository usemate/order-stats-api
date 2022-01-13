# STAGE 1
FROM node:14.17.1 as builder
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
RUN npm config set unsafe-perm true
RUN npm install -g typescript
USER node
RUN npm cache clean
RUN npm install
COPY --chown=node:node . .
RUN npm run build

# STAGE 2
FROM node:14.17.1
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
USER node
# RUN npm install --save-dev sequelize-cli
RUN npm install
COPY --from=builder /home/node/app/dist ./dist

COPY --chown=node:node .env .


CMD [ "node", "dist/index.js" ]