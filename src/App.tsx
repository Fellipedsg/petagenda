import { useEffect, useState } from 'react'
import './index.css'

type Mine = { date: string; time: string; pet: string; service: string }
type Screen = 'inicio' | 'agendar' | 'lembretes' | 'ok'

const SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']
const SERVICES = ['Banho', 'Tosa', 'Banho + Tosa']
const DAY = 864e5
// Vazio = mesmo domínio (Netlify). No GitHub Pages aponta para onde o backend estiver.
const API = import.meta.env.VITE_API_URL ?? ''

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
const ms = (m: { date: string; time: string }) => new Date(`${m.date}T${m.time}`).getTime()
const long = (d: string) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
const load = (): Mine[] => { try { return JSON.parse(localStorage.getItem('pa.mine') || '[]') } catch { return [] } }

// ponytail: só os próximos 14 dias; trocar por calendário completo se pedirem agendar mais longe.
const DAYS = Array.from({ length: 14 }, (_, i) => iso(new Date(Date.now() + i * DAY)))

export default function App() {
  const [screen, setScreen] = useState<Screen>('inicio')
  const [date, setDate] = useState(DAYS[0])
  const [taken, setTaken] = useState<string[]>([])
  const [slot, setSlot] = useState('')
  const [form, setForm] = useState({ pet: '', tutor: '', phone: '', service: SERVICES[0] })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [mine, setMine] = useState<Mine[]>(load)

  const refresh = () =>
    fetch(`${API}/api/slots?date=${date}`).then(r => r.json()).then(d => setTaken(d.taken || [])).catch(() => setMsg('Não consegui carregar os horários.'))
  useEffect(() => { setSlot(''); refresh() }, [date])

  const past = (t: string) => ms({ date, time: t }) < Date.now()
  const upcoming = mine.filter(m => ms(m) > Date.now()).sort((a, b) => ms(a) - ms(b))
  const next = upcoming[0]

  const book = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg('')
    const r = await fetch(`${API}/api/book`, { method: 'POST', body: JSON.stringify({ ...form, date, time: slot }) }).catch(() => null)
    setBusy(false)
    if (r?.ok) {
      const m = [...mine, { date, time: slot, pet: form.pet, service: form.service }]
      setMine(m); localStorage.setItem('pa.mine', JSON.stringify(m))
      setScreen('ok')
    } else {
      setMsg(r?.status === 409 ? 'Esse horário acabou de ser ocupado. Escolhe outro?' : 'Não deu pra agendar agora. Tenta de novo.')
      refresh()
    }
  }

  // Lembrete sai 24h antes (job de hora em hora no servidor).
  const reminder = (m: Mine) => {
    const at = ms(m) - DAY
    return at <= Date.now()
      ? { done: true, text: 'Faltam menos de 24h: o petshop já foi lembrado' }
      : { done: false, text: `Lembrete: ${new Date(at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${String(new Date(at).getHours()).padStart(2, '0')}h, o petshop é lembrado` }
  }

  return (
    <div className="app">
      {screen === 'inicio' && (
        <>
          <section className="dark">
            <span className="eyebrow">Banho e tosa</span>
            <h1>Seu pet cheiroso, sem fila.</h1>
            <p>Escolha o dia e o horário livre. O petshop é avisado na hora e se prepara para você.</p>
            <button className="cta" onClick={() => setScreen('agendar')}>Agendar agora</button>
          </section>
          <section className="card">
            <span className="eyebrow">Próximo horário</span>
            {next ? (
              <>
                <h2>{next.service} do {next.pet}</h2>
                <p>{long(next.date)} às {next.time}</p>
                <span className={`tag ${reminder(next).done ? 'ok' : ''}`}>{reminder(next).text}</span>
              </>
            ) : <p>Nada marcado ainda. Que tal agendar o primeiro?</p>}
          </section>
        </>
      )}

      {screen === 'agendar' && (
        <>
          <span className="eyebrow">Passo único</span>
          <h1>Quando fica bom pra você?</h1>
          <div className="days">
            {DAYS.map(d => {
              const dt = new Date(d + 'T12:00')
              return (
                <button key={d} className={`day ${d === date ? 'sel' : ''}`} onClick={() => setDate(d)}>
                  <small>{dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small>
                  <b>{dt.getDate()}</b>
                </button>
              )
            })}
          </div>
          <section className="card">
            <h2>Horários de {long(date)}</h2>
            <div className="slots">
              {SLOTS.map(t => {
                const busyT = taken.includes(t)
                return (
                  <button key={t} disabled={busyT || past(t)} className={`slot ${slot === t ? 'sel' : ''}`} onClick={() => setSlot(t)}>
                    {t}<small>{busyT ? 'Agendado' : past(t) ? 'Encerrado' : 'Livre'}</small>
                  </button>
                )
              })}
            </div>
          </section>
          <form className="card" onSubmit={book}>
            <h2>Sobre vocês</h2>
            <input required maxLength={80} placeholder="Nome do pet" value={form.pet} onChange={e => setForm({ ...form, pet: e.target.value })} />
            <input required maxLength={80} placeholder="Seu nome" value={form.tutor} onChange={e => setForm({ ...form, tutor: e.target.value })} />
            <input required type="tel" placeholder="Seu telefone com DDD" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}>
              {SERVICES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="cta" disabled={!slot || busy}>{busy ? 'Agendando…' : slot ? `Confirmar ${slot}` : 'Escolha um horário'}</button>
            {msg && <p className="msg">{msg}</p>}
          </form>
        </>
      )}

      {screen === 'ok' && (
        <section className="dark ok-screen">
          <div className="big">Agendado!</div>
          <p>Tudo certo. O petshop já foi avisado e vai lembrar do seu horário 24h antes.</p>
          <button className="cta" onClick={() => setScreen('lembretes')}>Ver meus lembretes</button>
          <button className="ghost" style={{ color: '#bba8f7' }} onClick={() => setScreen('inicio')}>Voltar ao início</button>
        </section>
      )}

      {screen === 'lembretes' && (
        <>
          <span className="eyebrow">Lembretes</span>
          <h1>No bolso, na hora certa.</h1>
          {upcoming.length === 0 && <p className="card">Sem agendamentos por enquanto.</p>}
          {upcoming.length > 0 && (
            <section className="lock">
              {upcoming.map(m => {
                const r = reminder(m)
                return (
                  <div key={m.date + m.time} className={`notif ${r.done ? '' : 'later'}`}>
                    <b>{r.done ? 'Lembrete · agora' : 'Lembrete · em breve'}</b>
                    <span>⏰ {m.service} do {m.pet} — {long(m.date)} às {m.time}</span>
                    <small className="k" style={{ color: '#bba8f7' }}>{r.text}</small>
                  </div>
                )
              })}
            </section>
          )}
        </>
      )}

      <nav className="tabs">
        {([['inicio', '🏠', 'Início'], ['agendar', '🗓️', 'Agendar'], ['lembretes', '🔔', 'Lembretes']] as const).map(([k, i, l]) => (
          <button key={k} className={screen === k ? 'on' : ''} onClick={() => setScreen(k)}><span>{i}</span>{l}</button>
        ))}
      </nav>
    </div>
  )
}
