#!/bin/bash

# CONFIGURAÇÕES ------------------------
CONTAINER_NAME="postgres-mooviai"
DB_NAME="cinemas"
DB_USER="mooviai"
DB_PASSWORD="ServerMoovia123"        # <<< SUA SENHA DO POSTGRES
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="backup_${DB_NAME}_${TIMESTAMP}.dump"
# --------------------------------------

echo "📦 Criando diretório de backup se não existir..."
mkdir -p "$BACKUP_DIR"

echo "🚀 Iniciando backup do banco $DB_NAME..."

# Executa o pg_dump dentro do container com PGPASSWORD
docker exec "$CONTAINER_NAME" bash -c "
  export PGPASSWORD='$DB_PASSWORD';
  pg_dump -U '$DB_USER' -F c -b -v -f '/tmp/$BACKUP_FILE' '$DB_NAME'
"

if [ $? -ne 0 ]; then
    echo "❌ Erro ao gerar backup dentro do container."
    exit 1
fi

echo "📥 Copiando backup para o host..."
docker cp "$CONTAINER_NAME:/tmp/$BACKUP_FILE" "$BACKUP_DIR/"

echo "🧹 Removendo arquivo temporário dentro do container..."
docker exec "$CONTAINER_NAME" rm "/tmp/$BACKUP_FILE"

echo "✅ Backup concluído!"
echo "📁 Salvo em: $BACKUP_DIR/$BACKUP_FILE"
