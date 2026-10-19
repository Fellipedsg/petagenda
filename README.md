# PetAgenda

Agendamento de banho e tosa. O tutor escolhe dia e horário; o petshop e o tutor recebem aviso por WhatsApp (Twilio).

- **Front** (`src/`): React + Vite, publicado no GitHub Pages a cada push na `main`.
- **Backend** (`worker/`): Cloudflare Worker + KV. Rotas `GET /api/slots?date=`, `POST /api/book`, e um cron de hora em hora que manda o lembrete de 24h.

## Publicar o backend

```bash
cd worker
npx wrangler login
npx wrangler deploy                       # cria o KV sozinho e imprime a URL do Worker
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_WHATSAPP_FROM   # ex.: whatsapp:+14155238886 (sandbox)
npx wrangler secret put PETSHOP_WHATSAPP       # ex.: 11999990000
```

Depois, em GitHub → Settings → Secrets and variables → Actions → **Variables**, crie `VITE_API_URL` com a URL do Worker (sem `/` no final) e rode o workflow *Deploy Pages*.

## Desenvolvimento

```bash
npm run dev                  # front
cd worker && npm run dev     # Worker local (KV simulado) em :8787
```
