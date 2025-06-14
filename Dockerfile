# Etapa de build (igual ao anterior)
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Imagem final ultra-leve
FROM alpine:3.19
WORKDIR /app

# Instala apenas Node.js e dependências mínimas
RUN apk add --no-cache nodejs tini

# Copia apenas os arquivos necessários
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Configurações finais
ENV NODE_ENV=production
USER 1000
EXPOSE 8000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]