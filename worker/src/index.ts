type Env = {
  BOOKINGS: KVNamespace
  ALLOWED_ORIGIN: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
}
type Booking = { date: string; time: string; pet: string; tutor: string; phone: string; service: string; reminded?: boolean }

const SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']
const SERVICES = ['Banho', 'Tosa', 'Banho + Tosa']
const DAY = 864e5

const key = (date: string, time: string) => `${date}T${time}`
// Brasil sem horário de verão: -03:00 fixo.
const startMs = (b: Booking) => new Date(`${b.date}T${b.time}:00-03:00`).getTime()
const when = (b: Booking) =>
  `${new Date(b.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às ${b.time}`

// Avisa o petshop no Telegram. Nunca lança: falha de envio não pode derrubar o agendamento.
async function notify(env: Env, text: string) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = env
  if (!token || !chat) {
    console.warn('Telegram não configurado (faltando:', [!token && 'token', !chat && 'chat'].filter(Boolean).join(', ') + '), aviso não enviado:', text)
    return false
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text }),
  })
  if (!r.ok) console.error('Telegram erro', r.status, await r.text())
  return r.ok
}

async function slots(env: Env, url: URL) {
  const date = url.searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'data inválida' }, { status: 400 })
  const { keys } = await env.BOOKINGS.list({ prefix: date })
  return Response.json({ taken: keys.map(k => k.name.slice(11)) })
}

async function book(env: Env, req: Request) {
  const b = (await req.json().catch(() => null)) as Booking | null
  const ok =
    b && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && SLOTS.includes(b.time) && SERVICES.includes(b.service) &&
    [b.pet, b.tutor, b.phone].every(s => typeof s === 'string' && s.trim() && s.length <= 80) &&
    b.phone.replace(/\D/g, '').length >= 10
  if (!ok) return Response.json({ error: 'dados inválidos' }, { status: 400 })
  if (startMs(b) < Date.now()) return Response.json({ error: 'horário já passou' }, { status: 400 })

  const booking: Booking = { date: b.date, time: b.time, pet: b.pet.trim(), tutor: b.tutor.trim(), phone: b.phone, service: b.service }
  const k = key(b.date, b.time)
  // ponytail: KV não tem "put se não existir" atômico; dois cliques no mesmo milissegundo podem passar. Trocar por D1 (PRIMARY KEY) se virar problema.
  if (await env.BOOKINGS.get(k)) return Response.json({ error: 'horário indisponível' }, { status: 409 })
  await env.BOOKINGS.put(k, JSON.stringify(booking))

  const notified = await notify(
    env,
    `🐾 Novo agendamento\n${booking.service} — ${booking.pet}\nTutor: ${booking.tutor} (${booking.phone})\n${when(booking)}`,
  )
  return Response.json({ ok: true, notified })
}

// Lembrete 24h antes para o petshop.
async function remind(env: Env) {
  const now = Date.now()
  const { keys } = await env.BOOKINGS.list()
  for (const { name } of keys) {
    const b = await env.BOOKINGS.get<Booking>(name, 'json')
    if (!b || b.reminded || startMs(b) < now || startMs(b) - now > DAY) continue
    // Só marca como lembrado se o envio deu certo; senão tenta de novo na próxima hora.
    if (!(await notify(env, `⏰ Lembrete: ${b.service} de ${b.pet} — ${when(b)}\nTutor: ${b.tutor} (${b.phone})`))) continue
    // Expira junto com o dia do agendamento para a lista não crescer para sempre.
    await env.BOOKINGS.put(name, JSON.stringify({ ...b, reminded: true }), { expiration: Math.floor(startMs(b) / 1000) + 86400 })
  }
}

export default {
  async fetch(req: Request, env: Env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    const url = new URL(req.url)
    let res: Response
    if (url.pathname === '/api/slots' && req.method === 'GET') res = await slots(env, url)
    else if (url.pathname === '/api/book' && req.method === 'POST') res = await book(env, req)
    else res = new Response('não encontrado', { status: 404 })
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
    return res
  },
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(remind(env))
  },
}
