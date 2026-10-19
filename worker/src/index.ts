type Env = {
  BOOKINGS: KVNamespace
  ALLOWED_ORIGIN: string
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_WHATSAPP_FROM?: string
  PETSHOP_WHATSAPP?: string
  TWILIO_TPL_BOOKING?: string // ID (HX…) do modelo "novo agendamento"
  TWILIO_TPL_REMINDER?: string // ID (HX…) do modelo "lembrete"
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

// Modelo aprovado: se o ID (HX…) estiver configurado, manda como modelo com {{1}}, {{2}}…; senão cai no texto livre.
type Tpl = { sid?: string; vars: string[] }
const clean = (s: string) => s.replace(/\s+/g, ' ').trim() // Twilio não aceita quebra de linha em variável

// Envia WhatsApp via Twilio. Nunca lança: falha de envio não pode derrubar o agendamento.
async function whatsapp(env: Env, to: string | undefined, body: string, tpl?: Tpl) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_WHATSAPP_FROM: from } = env
  if (!to || !sid || !token || !from) {
    const missing = Object.entries({ to, sid, token, from }).filter(([, v]) => !v).map(([k, v]) => `${k}=${v === undefined ? 'indefinido' : 'vazio'}`)
    console.warn('Twilio não configurado (faltando:', missing.join(', ') + '), mensagem não enviada:', body)
    return false
  }
  const num = to.replace(/\D/g, '')
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      From: from,
      To: `whatsapp:+${num.startsWith('55') ? num : '55' + num}`,
      ...(tpl?.sid
        ? { ContentSid: tpl.sid, ContentVariables: JSON.stringify(Object.fromEntries(tpl.vars.map((v, i) => [String(i + 1), clean(v)]))) }
        : { Body: body }),
    }),
  })
  if (!r.ok) console.error('Twilio erro', r.status, await r.text())
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

  const notified = await whatsapp(
    env, env.PETSHOP_WHATSAPP,
    `🐾 Novo agendamento\n${booking.service} — ${booking.pet}\nTutor: ${booking.tutor} (${booking.phone})\n${when(booking)}`,
    { sid: env.TWILIO_TPL_BOOKING, vars: [booking.service, booking.pet, `${booking.tutor} (${booking.phone})`, when(booking)] },
  )
  return Response.json({ ok: true, notified })
}

// Lembrete 24h antes para o petshop e para o tutor.
async function remind(env: Env) {
  const now = Date.now()
  const { keys } = await env.BOOKINGS.list()
  for (const { name } of keys) {
    const b = await env.BOOKINGS.get<Booking>(name, 'json')
    if (!b || b.reminded || startMs(b) < now || startMs(b) - now > DAY) continue
    const msg = `⏰ Lembrete: ${b.service} de ${b.pet} — ${when(b)}`
    const tpl: Tpl = { sid: env.TWILIO_TPL_REMINDER, vars: [b.service, b.pet, when(b), b.tutor] }
    await Promise.all([whatsapp(env, env.PETSHOP_WHATSAPP, `${msg}\nTutor: ${b.tutor} (${b.phone})`, tpl), whatsapp(env, b.phone, msg, tpl)])
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
