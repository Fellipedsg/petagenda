import type { Config } from '@netlify/functions'
import { type Booking, key, petshopNumber, startMs, store, when, whatsapp } from './_shared.mts'

const SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']
const SERVICES = ['Banho', 'Tosa', 'Banho + Tosa']

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 })
  const b = (await req.json().catch(() => null)) as Booking | null
  const ok =
    b && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && SLOTS.includes(b.time) && SERVICES.includes(b.service) &&
    [b.pet, b.tutor, b.phone].every(s => typeof s === 'string' && s.trim() && s.length <= 80) &&
    b.phone.replace(/\D/g, '').length >= 10
  if (!ok) return Response.json({ error: 'dados inválidos' }, { status: 400 })
  if (startMs(b) < Date.now()) return Response.json({ error: 'horário já passou' }, { status: 400 })

  const booking: Booking = { date: b.date, time: b.time, pet: b.pet.trim(), tutor: b.tutor.trim(), phone: b.phone, service: b.service }
  // onlyIfNew garante que dois clientes não peguem o mesmo horário.
  const { modified } = await store().setJSON(key(b.date, b.time), booking, { onlyIfNew: true })
  if (!modified) return Response.json({ error: 'horário indisponível' }, { status: 409 })

  const sent = petshopNumber()
    ? await whatsapp(petshopNumber(), `🐾 Novo agendamento\n${booking.service} — ${booking.pet}\nTutor: ${booking.tutor} (${booking.phone})\n${when(booking)}`)
    : false
  return Response.json({ ok: true, notified: sent })
}

export const config: Config = { path: '/api/book' }
