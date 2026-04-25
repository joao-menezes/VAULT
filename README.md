# 🔐 VAULT — Gerenciador de Senhas

Stack: **Next.js 14 + Neon PostgreSQL + Vercel**

## Segurança
- Login com e-mail/senha (bcrypt + JWT httpOnly cookie)
- Dados criptografados com **AES-256-GCM** antes de ir pro banco
- Chave derivada com **PBKDF2 (310.000 iterações)**
- O servidor **nunca vê suas senhas em texto puro**
- Dupla camada: autenticação de conta + senha mestre separada

---

## Deploy passo a passo

### 1. Criar banco no Neon

1. Acesse [neon.tech](https://neon.tech) e crie uma conta gratuita
2. Crie um novo projeto (ex: `vault-db`)
3. Copie a **Connection String** (formato `postgresql://...`)

### 2. Subir no GitHub

```bash
cd vault-app
git init
git add .
git commit -m "feat: vault inicial"
git remote add origin https://github.com/SEU_USER/vault-app.git
git push -u origin main
```

### 3. Deploy no Vercel

1. Acesse [vercel.com](https://vercel.com) → Import Project → selecione o repo
2. Em **Environment Variables**, adicione:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Cole a connection string do Neon |
| `JWT_SECRET` | Rode `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e cole o resultado |

3. Clique em **Deploy** — pronto!

### 4. Primeiro acesso

1. Abra a URL do Vercel
2. Crie sua conta (e-mail + senha de acesso)
3. Crie sua senha mestre (para criptografia — diferente da senha de login)
4. Comece a usar!

---

## Rodar localmente

```bash
cp .env.example .env.local
# Edite .env.local com suas variáveis

npm install
npm run dev
```

Acesse: http://localhost:3000
