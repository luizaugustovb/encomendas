#!/bin/bash
# ============================================
# Script de Deploy — Encomendas
# ============================================
# Uso: chmod +x deploy.sh && ./deploy.sh
# ============================================

set -e

echo "===== Encomendas — Deploy ====="

# Verificar se .env existe
if [ ! -f .env ]; then
  echo "ERRO: Arquivo .env não encontrado!"
  echo "Copie o exemplo e preencha: cp .env.example .env"
  exit 1
fi

# Carregar variáveis
source .env

echo "[1/5] Construindo imagens Docker..."
docker compose -f docker-compose.prod.yml build

echo "[2/5] Subindo banco, redis..."
docker compose -f docker-compose.prod.yml up -d postgres redis
echo "Aguardando banco de dados..."
sleep 10

echo "[3/5] Executando migrations do Prisma..."
docker compose -f docker-compose.prod.yml run --rm api npx prisma db push --accept-data-loss

echo "[4/5] Executando seed (admin master)..."
docker compose -f docker-compose.prod.yml run --rm api npx prisma db seed || echo "Seed já executado ou falhou (ignorando)."

echo "[5/5] Subindo todos os serviços..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "===== Deploy concluído! ====="
echo "Acesse: http://${DOMAIN:-localhost}"
echo ""
echo "Para obter SSL (HTTPS), execute:"
echo "  ./ssl.sh"
