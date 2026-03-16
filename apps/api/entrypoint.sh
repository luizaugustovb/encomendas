#!/bin/sh
# Entrypoint: sincroniza schema do banco antes de iniciar a API
# O docker-compose garante que o postgres já está healthy antes de executar
set -e

echo "[Entrypoint] Sincronizando schema com prisma db push..."
npx prisma db push --skip-generate && echo "[Entrypoint] Schema sincronizado com sucesso." || echo "[Entrypoint] Aviso: prisma db push falhou, pode já estar sincronizado."

echo "[Entrypoint] Iniciando API..."
exec node dist/src/main
