#!/bin/bash

# CONFIGURAÇÕES ------------------------
CONTAINER_NAME="postgres-mooviai"
DB_USER="postgres"
DB_PASSWORD="ServerMoovia123"         # <<< SUA SENHA DO POSTGRES
BACKUP_FILE="$1"
# --------------------------------------

if [ -z "$BACKUP_FILE" ]; then
    echo "❌ Você precisa informar o arquivo de backup."
    echo "👉 Exemplo: ./restore_postgres.sh backups/backup_cinemas_2025-11-16_19-34-21.dump"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Arquivo não encontrado: $BACKUP_FILE"
    exit 1
fi

echo "📤 Enviando backup para o container..."
docker cp "$BACKUP_FILE" "$CONTAINER_NAME:/tmp/restore.dump"

echo "🧨 Restaurando banco..."
docker exec -it "$CONTAINER_NAME" bash -c "
  export PGPASSWORD='$DB_PASSWORD';
  pg_restore -U '$DB_USER' -d postgres --clean --create /tmp/restore.dump
"

echo "🧹 Limpando arquivo temporário..."
docker exec "$CONTAINER_NAME" rm /tmp/restore.dump

echo "✅ Restore concluído com sucesso!"
