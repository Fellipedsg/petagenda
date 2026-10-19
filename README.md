# PetAgenda

Agendamento de banho e tosa. O tutor escolhe dia e horário; o petshop recebe aviso no Telegram (novo agendamento e lembrete 24h antes).

- **Front** (`src/`): React + Vite, publicado no GitHub Pages a cada push na `main`.
- **Backend** (`worker/`): Cloudflare Worker + KV. Rotas `GET /api/slots?date=`, `POST /api/book`, e um cron de hora em hora que avisa o petshop 24h antes de cada horário.

## Publicar o backend

```bash
cd worker
npx wrangler login
npx wrangler deploy                       # cria o KV sozinho e imprime a URL do Worker
npx wrangler secret put TELEGRAM_BOT_TOKEN   # token do @BotFather
npx wrangler secret put TELEGRAM_CHAT_ID     # id do chat do petshop (@userinfobot)
```

Depois, em GitHub → Settings → Secrets and variables → Actions → **Variables**, crie `VITE_API_URL` com a URL do Worker (sem `/` no final) e rode o workflow *Deploy Pages*.

## Desenvolvimento

```bash
npm run dev                  # front
cd worker && npm run dev     # Worker local (KV simulado) em :8787
```
