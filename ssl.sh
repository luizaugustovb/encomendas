#!/bin/bash
# ============================================
# Configurar SSL com Let's Encrypt
# ============================================
# Uso: chmod +x ssl.sh && ./ssl.sh
# ============================================

set -e

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado!"
  exit 1
fi

source .env

if [ -z "$DOMAIN" ]; then
  echo "ERRO: Variável DOMAIN não definida no .env"
  exit 1
fi

echo "===== Configurando SSL para: $DOMAIN ====="

# 1. Nginx precisa estar rodando para o desafio HTTP
docker compose -f docker-compose.prod.yml up -d nginx

# 2. Obter certificado
echo "[1/3] Obtendo certificado SSL..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint "" certbot \
  certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email ${MASTER_EMAIL:-admin@${DOMAIN}} \
  --agree-tos \
  --no-eff-email \
  -d ${DOMAIN}

# 3. Atualizar nginx com SSL
echo "[2/3] Atualizando configuração Nginx para HTTPS..."
cat > nginx/nginx.conf << 'NGINX_CONF'
upstream api_upstream {
    server api:3001;
}

upstream web_upstream {
    server web:3000;
}

# Redirecionar HTTP → HTTPS
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 50M;

    # API
    location /api/ {
        proxy_pass http://api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Uploads
    location /uploads/ {
        proxy_pass http://api_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Totem API
    location /totem-api/ {
        rewrite ^/totem-api/(.*)$ /api/totem/$1 break;
        proxy_pass http://api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        proxy_pass http://web_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONF

# Substituir placeholder pelo domínio real
sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" nginx/nginx.conf

# 4. Reiniciar nginx
echo "[3/3] Reiniciando Nginx..."
docker compose -f docker-compose.prod.yml restart nginx

echo ""
echo "===== SSL configurado! ====="
echo "Acesse: https://${DOMAIN}"
echo ""
echo "O certificado será renovado automaticamente pelo Certbot."
