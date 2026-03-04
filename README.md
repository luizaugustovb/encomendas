# Encomendas SaaS

Sistema multi-tenant de gestão de encomendas para condomínios, com QR Code, totem de autoatendimento, notificações WhatsApp e integração com controle de acesso Hikvision.

---

## Índice

- [Visão Geral](#visão-geral)
- [Stack Tecnológica](#stack-tecnológica)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Instalação Local (Desenvolvimento)](#instalação-local-desenvolvimento)
- [Deploy em Produção (DigitalOcean / Ubuntu + Docker)](#deploy-em-produção)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Banco de Dados](#banco-de-dados)
- [Documentação da API](#documentação-da-api)
- [Páginas do Frontend](#páginas-do-frontend)
- [Totem de Autoatendimento](#totem-de-autoatendimento)
- [Integrações](#integrações)

---

## Visão Geral

O **Encomendas SaaS** é uma plataforma completa para gestão de recebimento e retirada de encomendas em condomínios residenciais. O sistema permite:

- Cadastro de encomendas com foto e geração de QR Code
- Notificação automática do morador via WhatsApp
- Retirada via totem de autoatendimento com captura de fotos
- Controle de acesso integrado com equipamentos Hikvision (ISAPI)
- Gestão multi-tenant (vários condomínios em uma única instalação)
- Logs de auditoria completos
- Geração de etiquetas em PDF (A4 e térmica 80mm)

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Next.js 14, React 18, Tailwind CSS, Radix UI, TypeScript |
| **Backend** | NestJS 10, Prisma ORM 5, TypeScript |
| **Banco de Dados** | PostgreSQL 16 |
| **Cache** | Redis 7 |
| **Reverse Proxy** | Nginx + Let's Encrypt (produção) |
| **Infraestrutura** | Docker, Docker Compose |
| **QR Code** | qrcode (geração), jsQR (leitura) |
| **PDF** | PDFKit |
| **Upload** | Multer |
| **Auth** | JWT (Passport.js) |
| **WhatsApp** | API Viício |
| **Controle de Acesso** | Hikvision ISAPI (Digest Auth) |

---

## Funcionalidades

### Roles do Sistema

| Role | Descrição | Permissões |
|------|-----------|------------|
| `ADMIN` | Administrador Master | Acesso total a todos os condomínios |
| `ADMIN_CONDOMINIO` | Admin do Condomínio | Gerencia seu condomínio (usuários, unidades, configs) |
| `PORTEIRO` | Porteiro | Cadastra/retira encomendas, abre portas |
| `ZELADOR` | Zelador | Visualiza encomendas e dashboard |
| `MORADOR` | Morador | Visualiza suas encomendas, retira via totem |

### Módulos

#### 📦 Encomendas
- Cadastro com foto, morador destinatário, localização de armazenamento
- Geração automática de QR Code único por encomenda
- Retirada com foto de comprovação
- Geração de etiquetas em PDF (A4 e térmica 80mm)
- Envio de notificação WhatsApp ao morador

#### 🖥️ Totem de Autoatendimento
- Terminal fullscreen para retirada de encomendas sem intervenção do porteiro
- Leitura de QR Code pela câmera ou digitação manual do código
- Captura de foto do rosto + foto segurando a encomenda
- Seleção de morador alternativo (quando outro morador da unidade retira)
- Feed de câmera RTSP (monitoramento do ambiente)
- Timer de inatividade com reset automático

#### 👥 Usuários
- CRUD completo com soft/hard delete e reativação
- Upload de foto de perfil (usada para reconhecimento facial Hikvision)
- Sincronização automática com equipamento Hikvision (staff)
- Telefone com prefixo +55 automático

#### 🏢 Condomínios (Tenants)
- Gestão multi-tenant isolada
- Cada condomínio tem seus próprios usuários, unidades, localizações e configurações
- CNPJ, endereço, telefone

#### 🏠 Unidades
- Apartamentos e casas com bloco opcional
- Associação de moradores a unidades
- Constraint única: tenant + número + bloco

#### 📍 Localizações
- Locais de armazenamento de encomendas (ex: "E1-P2 → Estante 1, Prateleira 2")
- Código único por condomínio

#### ⚙️ Configurações
- **WhatsApp**: Token de API Viício por condomínio
- **Hikvision**: IP, porta, credenciais, habilitação por condomínio
- **Câmera RTSP**: URL da câmera para feed no totem

#### 📋 Logs de Auditoria
- Timeline completa de eventos: criação, retirada, WhatsApp, fotos, acesso
- Filtros por código, tipo de evento, unidade, período
- Barra de estatísticas por tipo
- Detalhes expandíveis com metadata e fotos

#### 🔐 Hikvision (Controle de Acesso)
- Sync de usuários/faces com equipamento via ISAPI
- Abertura/fechamento remoto de portas
- Escuta de eventos em tempo real
- Verificação de encomendas pendentes por reconhecimento facial
- Bibliotecas faciais

---

## Arquitetura

```
                    Internet
                       │
                    :80/:443
                       │
                   ┌───────┐
                   │ Nginx │  (reverse proxy + SSL)
                   └───┬───┘
                  ╱         ╲
           /api/*             /*
              │                │
        ┌─────────┐      ┌─────────┐
        │   API   │      │   Web   │
        │  :3001  │      │  :3000  │
        │ NestJS  │      │ Next.js │
        └────┬────┘      └─────────┘
             │
      ┌──────┼──────┐
      │      │      │
┌─────┴──┐ ┌─┴───┐ ┌─┴────────┐
│Postgres│ │Redis│ │Hikvision │
│  :5432 │ │:6379│ │  (LAN)   │
└────────┘ └─────┘ └──────────┘
```

---

## Instalação Local (Desenvolvimento)

### Pré-requisitos

- Node.js 20+
- Docker Desktop (para PostgreSQL e Redis)
- Git

### Passos

```bash
# 1. Clonar o repositório
git clone https://github.com/luizaugustovb/encomendas.git
cd encomendas

# 2. Subir PostgreSQL e Redis
docker compose up -d

# 3. Instalar dependências da API
cd apps/api
npm install

# 4. Configurar variáveis de ambiente
cd ../..
cp .env.example .env
# Editar .env com suas configurações

# 5. Criar banco e executar seed
cd apps/api
npx prisma db push
npx prisma db seed

# 6. Instalar dependências do Web
cd ../web
npm install

# 7. Rodar API (em um terminal)
cd ../api
npx nest start --watch

# 8. Rodar Frontend (em outro terminal)
cd ../web
npm run dev
```

### Acessos

| Serviço | URL |
|---------|-----|
| **Frontend** | http://localhost:3000 |
| **API** | http://localhost:3001 |
| **PostgreSQL** | localhost:5433 |
| **Redis** | localhost:6379 |

---

## Deploy em Produção

### Requisitos do Servidor

- Ubuntu 22.04 LTS
- Docker + Docker Compose (v2)
- 2GB RAM mínimo (recomendado 4GB)
- Domínio apontando para o IP do servidor

### Comandos SSH (copie e cole no servidor)

```bash
# ============================================
# 1. PREPARAR O SERVIDOR
# ============================================

# Atualizar sistema e instalar dependências
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl

# Instalar Docker (se ainda não tiver)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Reconecte o SSH após esse comando para aplicar o grupo docker

# Verificar Docker
docker --version
docker compose version

# ============================================
# 2. CLONAR O PROJETO
# ============================================

cd /opt
sudo git clone https://github.com/luizaugustovb/encomendas.git
sudo chown -R $USER:$USER encomendas
cd encomendas

# ============================================
# 3. CONFIGURAR VARIÁVEIS DE AMBIENTE
# ============================================

cp .env.example .env
nano .env

# --- Preencha no nano: ---
# POSTGRES_USER=encomendas
# POSTGRES_PASSWORD=SuaSenhaForte123!
# POSTGRES_DB=encomendas_db
# DATABASE_URL=postgresql://encomendas:SuaSenhaForte123!@postgres:5432/encomendas_db
# REDIS_HOST=redis
# REDIS_PORT=6379
# JWT_SECRET=gere-uma-string-aleatoria-com-64-chars
# MASTER_EMAIL=seu@email.com
# MASTER_PASSWORD=SuaSenhaMaster
# WHATSAPP_API_URL=https://api.viicio.com.br
# WHATSAPP_API_TOKEN=seu-token-aqui
# CORS_ORIGIN=https://seudominio.com
# DOMAIN=seudominio.com
# --- Salve com Ctrl+O, Enter, Ctrl+X ---

# ============================================
# 4. DEPLOY (Build + Start)
# ============================================

chmod +x deploy.sh ssl.sh
./deploy.sh

# O script faz automaticamente:
# - Constrói imagens Docker (API + Web)
# - Sobe PostgreSQL e Redis
# - Executa migrations (prisma db push)
# - Executa seed (cria admin master)
# - Sobe API, Web e Nginx

# ============================================
# 5. VERIFICAR
# ============================================

# Ver status dos containers
docker compose -f docker-compose.prod.yml ps

# Testar API
curl http://localhost/api

# Ver logs (se algo estiver errado)
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web

# ============================================
# 6. CONFIGURAR DNS (no painel do domínio)
# ============================================

# Crie registros A:
#   seudominio.com       → IP_DO_SERVIDOR
#   www.seudominio.com   → IP_DO_SERVIDOR

# ============================================
# 7. ATIVAR SSL (HTTPS) — após DNS propagado
# ============================================

./ssl.sh

# ============================================
# 8. FIREWALL
# ============================================

sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw --force enable

# ============================================
# ✅ PRONTO! Acesse: https://seudominio.com
# ============================================
```

### Comandos úteis pós-deploy

```bash
# Ver logs em tempo real
docker compose -f docker-compose.prod.yml logs -f

# Logs de um serviço específico
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f nginx

# Reiniciar todos os serviços
docker compose -f docker-compose.prod.yml restart

# Reiniciar um serviço específico
docker compose -f docker-compose.prod.yml restart api

# Parar tudo
docker compose -f docker-compose.prod.yml down

# Atualizar (novo deploy após git pull)
cd /opt/encomendas
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build

# Acessar banco de dados
docker exec -it encomendas_postgres psql -U encomendas -d encomendas_db

# Rodar migration após mudanças no schema
docker compose -f docker-compose.prod.yml run --rm api npx prisma db push

# Backup do banco
docker exec encomendas_postgres pg_dump -U encomendas encomendas_db > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker exec -i encomendas_postgres psql -U encomendas -d encomendas_db < backup.sql
```

---

## Variáveis de Ambiente

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `POSTGRES_USER` | `encomendas` | Usuário do PostgreSQL |
| `POSTGRES_PASSWORD` | `senha123` | Senha do PostgreSQL |
| `POSTGRES_DB` | `encomendas_db` | Nome do banco |
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/db` | URL do Prisma (host=`postgres` no Docker) |
| `REDIS_HOST` | `redis` | Host do Redis (`redis` no Docker, `localhost` em dev) |
| `REDIS_PORT` | `6379` | Porta do Redis |
| `JWT_SECRET` | `string-aleatoria-64-chars` | Segredo para assinatura JWT |
| `JWT_EXPIRES_IN` | `7d` | Validade do token JWT |
| `MASTER_EMAIL` | `admin@email.com` | Email do admin master (criado no seed) |
| `MASTER_PASSWORD` | `senha` | Senha do admin master |
| `WHATSAPP_API_URL` | `https://api.viicio.com.br` | URL da API WhatsApp |
| `WHATSAPP_API_TOKEN` | `token` | Token da API WhatsApp |
| `CORS_ORIGIN` | `https://seudominio.com` | Domínios permitidos (separados por vírgula) |
| `DOMAIN` | `seudominio.com` | Domínio para SSL |
| `API_PORT` | `3001` | Porta da API |

---

## Banco de Dados

### Modelos

#### Tenant (Condomínio)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `name` | String | Nome do condomínio |
| `document` | String? | CNPJ |
| `address` | String? | Endereço |
| `phone` | String? | Telefone |
| `active` | Boolean | Ativo/Inativo (soft delete) |

#### TenantConfig (Configurações)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tenantId` | FK → Tenant | Um por condomínio |
| `whatsappToken` | String? | Token WhatsApp |
| `hikvisionIp` | String? | IP do equipamento |
| `hikvisionPort` | Int? | Porta (padrão 80) |
| `hikvisionUser` | String? | Usuário Hikvision |
| `hikvisionPassword` | String? | Senha Hikvision |
| `hikvisionEnabled` | Boolean | Habilitado |
| `rtspCameraUrl` | String? | URL câmera RTSP |

#### User (Usuário)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `tenantId` | FK → Tenant | Condomínio |
| `name` | String | Nome completo |
| `email` | String (unique) | Email |
| `password` | String | Hash bcrypt |
| `phone` | String? | Telefone |
| `role` | Enum | ADMIN, ADMIN_CONDOMINIO, PORTEIRO, ZELADOR, MORADOR |
| `unitId` | FK → Unit? | Unidade (para moradores) |
| `photoUrl` | String? | Foto de perfil |
| `active` | Boolean | Ativo/Inativo |
| `hikvisionEmployeeNo` | String? | ID no equipamento Hikvision |
| `hikvisionSynced` | Boolean | Sincronizado com Hikvision |

#### Unit (Unidade)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `tenantId` | FK → Tenant | Condomínio |
| `number` | String | Número (ex: "101") |
| `block` | String? | Bloco (ex: "A") |
| `type` | String | APARTAMENTO ou CASA |
| `active` | Boolean | Ativo/Inativo |

#### Location (Localização de Armazenamento)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `tenantId` | FK → Tenant | Condomínio |
| `code` | String | Código (ex: "E1-P2") |
| `description` | String? | Descrição |
| `active` | Boolean | Ativo/Inativo |

#### Delivery (Encomenda)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `tenantId` | FK → Tenant | Condomínio |
| `code` | String (unique) | Código da encomenda |
| `qrcode` | String | Dados do QR Code |
| `status` | Enum | PENDING ou WITHDRAWN |
| `userId` | FK → User | Morador destinatário |
| `unitId` | FK → Unit | Unidade |
| `locationId` | FK → Location | Local de armazenamento |
| `receivedById` | FK → User | Quem recebeu (porteiro) |
| `description` | String? | Descrição da encomenda |
| `withdrawnAt` | DateTime? | Data/hora da retirada |
| `withdrawnById` | FK → User? | Quem retirou |
| `photoUrl` | String? | Foto do recebimento |
| `withdrawPhotoUrl` | String? | Foto da retirada |

#### DeliveryEvent (Evento de Auditoria)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `deliveryId` | FK → Delivery | Encomenda |
| `userId` | FK → User? | Responsável |
| `type` | Enum | CREATED, WITHDRAWN, WHATSAPP_SENT, TOTEM_PHOTO_CAPTURED, TOTEM_OTHER_RESIDENT, DOOR_ACCESS |
| `metadata` | String? | Dados extras (JSON) |
| `photoUrl` | String? | Foto do evento |

---

## Documentação da API

**Base URL:** `http://localhost:3001/api` (dev) ou `https://seudominio.com/api` (prod)

**Autenticação:** Bearer token JWT no header `Authorization: Bearer <token>`

### Auth

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/auth/login` | Público | Login → retorna `{ access_token, user }` |
| `POST` | `/auth/register` | Público | Registrar usuário |
| `GET` | `/auth/profile` | JWT | Perfil do usuário logado |

**Login:**
```json
POST /api/auth/login
{
  "email": "admin@email.com",
  "password": "senha123"
}
// Retorno:
{
  "access_token": "eyJhbGciOi...",
  "user": {
    "id": "uuid",
    "name": "Admin",
    "email": "admin@email.com",
    "role": "ADMIN",
    "tenantId": "uuid",
    "tenantName": "Condomínio Sol Nascente"
  }
}
```

### Encomendas

| Método | Rota | Auth | Roles | Descrição |
|--------|------|------|-------|-----------|
| `GET` | `/deliveries` | JWT | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR | Listar encomendas |
| `GET` | `/deliveries/dashboard` | JWT | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR | Estatísticas do dashboard |
| `GET` | `/deliveries/audit/logs` | JWT | ADMIN, ADMIN_COND | Logs de auditoria |
| `GET` | `/deliveries/:id` | JWT | Qualquer logado | Detalhes da encomenda |
| `POST` | `/deliveries` | JWT | ADMIN, ADMIN_COND, PORTEIRO | Criar encomenda |
| `POST` | `/deliveries/withdraw` | JWT | ADMIN, ADMIN_COND, PORTEIRO, MORADOR | Registrar retirada |
| `GET` | `/deliveries/:id/label` | JWT | ADMIN, ADMIN_COND, PORTEIRO | Gerar etiqueta PDF |
| `POST` | `/deliveries/:id/whatsapp` | JWT | ADMIN, ADMIN_COND, PORTEIRO | Enviar WhatsApp |

**Criar encomenda (multipart/form-data):**
```
POST /api/deliveries
- userId: UUID (morador destinatário)
- locationId: UUID (local de armazenamento)
- description: String (opcional)
- photo: File (opcional, foto da encomenda)
```

**Logs de auditoria:**
```
GET /api/deliveries/audit/logs?deliveryId=uuid&type=CREATED&from=2024-01-01&to=2024-12-31&unitId=uuid
```

### Totem (Público — sem autenticação)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/totem/config/:tenantId/rtsp` | URL da câmera RTSP |
| `GET` | `/totem/delivery/:code` | Buscar encomenda por código |
| `GET` | `/totem/delivery/:code/residents` | Moradores da unidade |
| `POST` | `/totem/withdraw` | Confirmar retirada (multipart: code, withdrawnById?, photos[]) |

### Usuários

| Método | Rota | Auth | Roles | Descrição |
|--------|------|------|-------|-----------|
| `GET` | `/users` | JWT | ADMIN, ADMIN_COND, PORTEIRO | Listar usuários |
| `GET` | `/users/:id` | JWT | ADMIN, ADMIN_COND, PORTEIRO | Detalhes do usuário |
| `POST` | `/users` | JWT | ADMIN, ADMIN_COND | Criar usuário |
| `PUT` | `/users/:id` | JWT | ADMIN, ADMIN_COND | Atualizar usuário |
| `DELETE` | `/users/:id` | JWT | ADMIN, ADMIN_COND | Desativar (soft delete) |
| `PATCH` | `/users/:id/reactivate` | JWT | ADMIN, ADMIN_COND | Reativar usuário |
| `DELETE` | `/users/:id/permanent` | JWT | ADMIN, ADMIN_COND | Excluir permanentemente |
| `POST` | `/users/:id/photo` | JWT | ADMIN, ADMIN_COND, PORTEIRO | Upload de foto |

### Condomínios (Tenants) — Apenas ADMIN

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/tenants` | Listar condomínios |
| `GET` | `/tenants/:id` | Detalhes |
| `POST` | `/tenants` | Criar condomínio |
| `PUT` | `/tenants/:id` | Atualizar |
| `DELETE` | `/tenants/:id` | Desativar |
| `PATCH` | `/tenants/:id/reactivate` | Reativar |
| `DELETE` | `/tenants/:id/permanent` | Excluir permanentemente |

### Unidades

| Método | Rota | Auth | Roles | Descrição |
|--------|------|------|-------|-----------|
| `GET` | `/units` | JWT | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR | Listar unidades |
| `GET` | `/units/:id` | JWT | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR | Detalhes |
| `POST` | `/units` | JWT | ADMIN, ADMIN_COND | Criar unidade |
| `PUT` | `/units/:id` | JWT | ADMIN, ADMIN_COND | Atualizar |
| `DELETE` | `/units/:id` | JWT | ADMIN, ADMIN_COND | Remover |

### Localizações

| Método | Rota | Auth | Roles | Descrição |
|--------|------|------|-------|-----------|
| `GET` | `/locations` | JWT | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR | Listar locais |
| `GET` | `/locations/:id` | JWT | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR | Detalhes |
| `POST` | `/locations` | JWT | ADMIN, ADMIN_COND | Criar local |
| `PUT` | `/locations/:id` | JWT | ADMIN, ADMIN_COND | Atualizar |
| `DELETE` | `/locations/:id` | JWT | ADMIN, ADMIN_COND | Remover |

### Configurações (Tenant Config)

| Método | Rota | Auth | Roles | Descrição |
|--------|------|------|-------|-----------|
| `GET` | `/tenant-config` | JWT | ADMIN, ADMIN_COND | Config do próprio tenant |
| `GET` | `/tenant-config/:tenantId` | JWT | ADMIN | Config de qualquer tenant |
| `PUT` | `/tenant-config` | JWT | ADMIN, ADMIN_COND | Atualizar config |
| `PUT` | `/tenant-config/:tenantId` | JWT | ADMIN | Atualizar config de tenant |
| `POST` | `/tenant-config/test/whatsapp` | JWT | ADMIN | Testar WhatsApp |
| `POST` | `/tenant-config/test/hikvision` | JWT | ADMIN | Testar conexão Hikvision |

**Atualizar configurações:**
```json
PUT /api/tenant-config
{
  "whatsappToken": "token-viicio",
  "hikvisionIp": "192.168.0.105",
  "hikvisionPort": 80,
  "hikvisionUser": "admin",
  "hikvisionPassword": "senha",
  "hikvisionEnabled": true,
  "rtspCameraUrl": "http://192.168.0.105/ISAPI/Streaming/channels/101/httpPreview"
}
```

### Hikvision (Controle de Acesso)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/hikvision/event/:tenantId` | Público | Callback de eventos do equipamento |
| `POST` | `/hikvision/admin/test-connection` | JWT | Testar conexão |
| `GET` | `/hikvision/admin/capabilities` | JWT | Capacidades do dispositivo |
| `POST` | `/hikvision/admin/door/open` | JWT | Abrir porta |
| `POST` | `/hikvision/admin/door/close` | JWT | Fechar porta |
| `POST` | `/hikvision/admin/door/keep-open` | JWT | Manter porta aberta |
| `POST` | `/hikvision/admin/sync/all` | JWT | Sincronizar todos os usuários |
| `POST` | `/hikvision/admin/sync/user/:userId` | JWT | Sincronizar um usuário |
| `DELETE` | `/hikvision/admin/sync/user/:userId` | JWT | Remover do equipamento |
| `POST` | `/hikvision/admin/sync/user/:userId/face` | JWT | Upload de face |
| `GET` | `/hikvision/admin/device/users` | JWT | Listar usuários no dispositivo |
| `GET` | `/hikvision/admin/events` | JWT | Logs de acesso |
| `POST` | `/hikvision/admin/stream/start` | JWT | Iniciar escuta de eventos |
| `POST` | `/hikvision/admin/stream/stop` | JWT | Parar escuta |
| `GET` | `/hikvision/admin/stream/status` | JWT | Status dos streams |
| `GET` | `/hikvision/admin/face-libraries` | JWT | Listar bibliotecas faciais |
| `GET` | `/hikvision/admin/face-libraries/:fdid/faces` | JWT | Faces de uma biblioteca |
| `POST` | `/hikvision/admin/authorize` | JWT | Verificar pendências por userId |
| `POST` | `/hikvision/admin/authorize/employee` | JWT | Verificar por employeeNo |

**Total: 65 endpoints (7 públicos, 58 autenticados)**

---

## Páginas do Frontend

| Rota | Página | Roles |
|------|--------|-------|
| `/login` | Login | Pública |
| `/dashboard` | Dashboard com estatísticas | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR |
| `/dashboard/deliveries` | Gestão de encomendas | ADMIN, ADMIN_COND, PORTEIRO, ZELADOR |
| `/dashboard/users` | Gestão de usuários | ADMIN, ADMIN_COND |
| `/dashboard/units` | Gestão de unidades | ADMIN, ADMIN_COND |
| `/dashboard/locations` | Gestão de localizações | ADMIN, ADMIN_COND |
| `/dashboard/tenants` | Gestão de condomínios | ADMIN |
| `/dashboard/settings` | Configurações (WhatsApp, Hikvision, RTSP) | ADMIN, ADMIN_COND |
| `/dashboard/audit` | Logs de auditoria | ADMIN, ADMIN_COND |
| `/totem` | Totem de autoatendimento | Pública (fullscreen) |

---

## Totem de Autoatendimento

O totem é acessado em modo fullscreen, sem necessidade de login:

```
https://seudominio.com/totem?tenant=UUID_DO_CONDOMINIO
```

### Fluxo de uso

1. **Tela de Scan** — O morador posiciona o QR Code da etiqueta na câmera
2. **Encomenda Encontrada** — Mostra dados da encomenda e pergunta se é o morador correto
3. **Seleção de Morador** — Se outro morador da unidade está retirando, seleciona na lista
4. **Foto do Rosto** — Câmera frontal captura o rosto de quem retira
5. **Foto da Encomenda** — Câmera traseira captura foto segurando a encomenda
6. **Confirmação** — Revisão das fotos e dados antes de confirmar
7. **Sucesso** — Retirada registrada, auto-redirect em 10s

### Recursos do Totem
- Leitura automática de QR Code via câmera
- Digitação manual do código como alternativa
- Feed de câmera RTSP para monitoramento ("Ambiente Monitorado")
- Timer de inatividade (60s) → volta ao scan
- Debounce de QR duplicado (5s)

---

## Integrações

### WhatsApp (API Viício)

Notifica moradores automaticamente quando uma encomenda é registrada. Configurado por condomínio em **Configurações → WhatsApp**.

### Hikvision ISAPI

Integração com equipamentos de controle de acesso facial Hikvision:
- Sincronização de staff (porteiros, zeladores, admins) com o equipamento
- Upload de faces para reconhecimento facial
- Callback de eventos → verifica se morador tem encomendas pendentes
- Abertura remota de portas
- Escuta de eventos em tempo real

### Câmera RTSP

Feed de câmera HTTP/MJPEG exibido no totem para monitoramento do ambiente. Configurado por condomínio em **Configurações → Câmera RTSP**.

---

## Estrutura de Arquivos

```
encomendas/
├── docker-compose.yml          # Dev: PostgreSQL + Redis
├── docker-compose.prod.yml     # Prod: Stack completa
├── deploy.sh                   # Script de deploy automático
├── ssl.sh                      # Script de configuração SSL
├── nginx/
│   └── nginx.conf              # Reverse proxy Nginx
├── apps/
│   ├── api/                    # Backend NestJS
│   │   ├── Dockerfile
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Schema do banco
│   │   │   └── seed.ts         # Dados iniciais
│   │   └── src/
│   │       ├── main.ts         # Entry point
│   │       ├── auth/           # Autenticação JWT
│   │       ├── deliveries/     # Encomendas + Totem
│   │       ├── hikvision/      # Integração Hikvision
│   │       ├── locations/      # Locais de armazenamento
│   │       ├── prisma/         # Prisma service
│   │       ├── redis/          # Redis service
│   │       ├── tenant-config/  # Configurações
│   │       ├── tenants/        # Condomínios
│   │       ├── units/          # Unidades
│   │       ├── users/          # Usuários
│   │       └── whatsapp/       # Integração WhatsApp
│   └── web/                    # Frontend Next.js
│       ├── Dockerfile
│       └── src/
│           ├── app/
│           │   ├── dashboard/  # Páginas do painel
│           │   ├── login/      # Página de login
│           │   └── totem/      # Totem de autoatendimento
│           ├── components/     # Componentes reutilizáveis
│           └── lib/            # API client, auth, utils
└── .env.example                # Template de variáveis
```

---

## Licença

Projeto privado — todos os direitos reservados.
