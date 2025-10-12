# Etapa 1: build dos arquivos TypeScript
FROM node:20 AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .
RUN pnpm run build

# Etapa 2: imagem final para produção
FROM node:20-slim

WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/dist ./dist

RUN npm install -g pnpm && pnpm install --prod

ENV NODE_ENV=production
EXPOSE 9000

CMD ["node", "dist/index.js"]