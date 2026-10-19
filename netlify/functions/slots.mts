import type { Config } from '@netlify/functions'
import { store } from './_shared.mts'

// Devolve só os horários ocupados do dia (sem dados pessoais).
export default async (req: Request) => {
  const date = new URL(req.url).searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'data inválida' }, { status: 400 })
  const { blobs } = await store().list({ prefix: date })
  return Response.json({ taken: blobs.map(b => b.key.slice(11)) })
}

export const config: Config = { path: '/api/slots' }
