import { getStore } from '@netlify/blobs'

export type Booking = {
  date: string; time: string; pet: string; tutor: string; phone: string; service: string
  reminded?: boolean
}

export const store = () => getStore('bookings')
export const key = (date: string, time: string) => `${date}T${time}`
// Brasil sem horário de verão: -03:00 fixo.
export const startMs = (b: Booking) => new Date(`${b.date}T${b.time}:00-03:00`).getTime()
export const when = (b: Booking) =>
  `${new Date(b.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às ${b.time}`

// Envia WhatsApp via Twilio. Nunca lança: falha de envio não pode derrubar o agendamento.
export async function whatsapp(to: string, body: string) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_WHATSAPP_FROM: from } = process.env
  if (!sid || !token || !from) { console.warn('Twilio não configurado, mensagem não enviada:', body); return false }
  const num = to.replace(/\D/g, '')
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: `whatsapp:+${num.startsWith('55') ? num : '55' + num}`, Body: body }),
  })
  if (!r.ok) console.error('Twilio erro', r.status, await r.text())
  return r.ok
}

export const petshopNumber = () => process.env.PETSHOP_WHATSAPP || ''
