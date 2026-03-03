# Encomendas SaaS

Sistema de gestão de encomendas para condomínios com QRCode, WhatsApp e integração Hikvision.

## Requisitos

- Node.js 18+
- Docker Desktop (para PostgreSQL e Redis)

## Setup Rápido

```bash
# 1. Subir PostgreSQL e Redis
docker-compose up -d

# 2. Instalar dependências
npm run install:all

# 3. Criar banco e executar seed
npm run db:push
npm run db:seed

# 4. Rodar o sistema
npm run dev
```

## Acesso

- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001

## Login Master

- **Email:** contato@luizaugusto.me
- **Senha:** Luiz2012@...

## Login Demo

- **Admin:** admin@solnascente.com / 123456
- **Porteiro:** porteiro@solnascente.com / 123456
- **Morador:** morador@solnascente.com / 123456

## Stack

- **Frontend:** Next.js 14, React, Tailwind CSS, Radix UI
- **Backend:** NestJS, Prisma, PostgreSQL, Redis
- **Infra:** Docker Compose
