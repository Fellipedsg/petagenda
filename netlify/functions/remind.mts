import type { Config } from '@netlify/functions'
import { type Booking, petshopNumber, startMs, store, when, whatsapp } from './_shared.mts'

// Roda de hora em hora: avisa petshop e tutor sobre agendamentos nas próximas 24h.
export default async () => {
  const s = store()
  const now = Date.now()
  const { blobs } = await s.list()
  for (const { key } of blobs) {
    const b = (await s.get(key, { type: 'json' })) as Booking | null
    if (!b || b.reminded || startMs(b) < now || startMs(b) - now > 864e5) continue
    const msg = `⏰ Lembrete: ${b.service} de ${b.pet} — ${when(b)}`
    await Promise.all([whatsapp(petshopNumber(), `${msg}\nTutor: ${b.tutor} (${b.phone})`), whatsapp(b.phone, msg)])
    await s.setJSON(key, { ...b, reminded: true })
  }
}

// ponytail: lista todos os agendamentos a cada hora; trocar por índice por data se passar de alguns milhares.
export const config: Config = { schedule: '0 * * * *' }
