import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronsUpDown, Copy, Play, Search, Terminal, WrapText } from 'lucide-react'
import { Journey, ANIMATED } from './journey/Journey'
import { METHODS, FIELDS, curl, ts, run, missing, EXAMPLE_ADDRESS, setNet, type Net, recentSignature, sampleMessage } from './rpc'

const NET_STORE = 'helius-playground-net'
const getNet = (): Net => { try { return localStorage.getItem(NET_STORE) === 'devnet' ? 'devnet' : 'mainnet' } catch { return 'mainnet' } }
const KEY = 'server' // the API key lives on the server; the browser never sees it

/* ---------- syntax colours, like the live playground ---------- */
const TOK = /('[^']*'|"[^"]*"|--[a-z-]+|\b(?:curl|const|await)\b|\btrue\b|\bfalse\b|\bnull\b|\b\d+(?:\.\d+)?\b)/g
function Line({ s, json }: { s: string; json?: boolean }) {
  return <>{s.split(TOK).map((p, i) => {
    if (i % 2 === 0) return <span key={i}>{p}</span>
    let c = 'g'
    if (p.startsWith('--')) c = 'b'; else if (/^(curl|const|await)$/.test(p)) c = 'r'; else if (/^(true|false|null|\d)/.test(p)) c = 'o'
    if (json && p.startsWith('"') && /^\s*:/.test(s.split(TOK)[i + 1] || '')) c = 'b'
    return <span key={i} className={`tk-${c}`}>{p}</span>
  })}</>
}
function Code({ text, wrap, json }: { text: string; wrap: boolean; json?: boolean }) {
  const lines = text.split('\n')
  return <div className={`code${wrap ? ' wrap' : ''}`}><div className="gut">{lines.map((_, i) => <span key={i}>{i + 1}</span>)}</div><pre>{lines.map((l, i) => <div key={i}><Line s={l} json={json} /></div>)}</pre></div>
}

/* ---------- small pieces ---------- */
function Combobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [hi, setHi] = useState(0), ref = useRef<HTMLDivElement>(null)
  const list = useMemo(() => ANIMATED.filter(m => m.toLowerCase().includes(q.toLowerCase())), [q])
  useEffect(() => { const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f) }, [])
  useEffect(() => setHi(0), [q])
  const pick = (m: string) => { onChange(m); setOpen(false); setQ('') }
  return (
    <div className="combo" ref={ref}>
      <button type="button" className="select mono" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>{value}<ChevronsUpDown size={14} /></button>
      {open && <div className="pop">
        <label className="pop-s"><Search size={14} /><input autoFocus placeholder="Search methods" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(list.length - 1, h + 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) } else if (e.key === 'Enter' && list[hi]) pick(list[hi]); else if (e.key === 'Escape') setOpen(false) }} /></label>
        <div className="pop-l" role="listbox">{list.length ? list.map((m, i) => <button key={m} role="option" aria-selected={m === value} className={`opt mono${i === hi ? ' hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(m)}>{m}</button>) : <p className="none">No methods found.</p>}</div>
      </div>}
    </div>
  )
}

/* ---------- pages ---------- */
type Res = { status: number; ms: number; json: unknown } | null
const NETS = ['mainnet', 'devnet'] as const
const NetSeg = ({ n, set }: { n: Net; set: (n: Net) => void }) => <div className="seg" role="radiogroup" aria-label="Network">{NETS.map(x => <button key={x} type="button" role="radio" aria-checked={n === x} className={n === x ? 'on' : ''} onClick={() => set(x)}>{x === 'mainnet' ? 'Mainnet' : 'Devnet'}</button>)}</div>
function Page({ net, setNet: onNet }: { net: Net; setNet: (n: Net) => void }) {
  const keyVal = KEY
  const [method, setMethod] = useState('getAccountInfo'), [vals, setVals] = useState<Record<string, string>>({ address: EXAMPLE_ADDRESS, mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', size: '165' })
  const [pane, setPane] = useState<'req' | 'res'>('req'), [lang, setLang] = useState<'curl' | 'ts'>('curl'), [langOpen, setLangOpen] = useState(false), [wrap, setWrap] = useState(false), [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Res>(null), [err, setErr] = useState(''), [arrived, setArrived] = useState(false)
  const [runId, setRunId] = useState(0), [anchor, setAnchor] = useState<{ slot: number; at: number } | null>(null), [slotMs, setSlotMs] = useState(400)
  const [helping, setHelping] = useState(false), [helpErr, setHelpErr] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null), lboxRef = useRef<HTMLDivElement>(null), runRef = useRef<HTMLButtonElement>(null), termRef = useRef<HTMLDivElement>(null)
  const help = async (k: string) => { setHelping(true); setHelpErr(''); try { const x = k === 'signature' ? await recentSignature(keyVal, vals.address || EXAMPLE_ADDRESS) : await sampleMessage(keyVal, vals.address || EXAMPLE_ADDRESS); setVals(o => ({ ...o, [k]: x })) } catch (e) { setHelpErr(e instanceof Error ? e.message : 'Failed.') } finally { setHelping(false) } }
  const fields = FIELDS[method] || [], miss = missing(method, vals)
  const [last, setLast] = useState(fields), shown = fields.length ? fields : last
  useEffect(() => { if (fields.length) setLast(fields) }, [method])
  const text = lang === 'curl' ? curl(method, vals, '') : ts(method, vals, '') // shows YOUR_API_KEY: the real key stays on the server
  const copyText = text
  useEffect(() => { const f = () => setLangOpen(false); document.addEventListener('click', f); return () => document.removeEventListener('click', f) }, [])
  useEffect(() => { // read the live slot, then again 2.4 s later, so the clocks tick at the cluster's real pace
    let dead = false; setAnchor(null)
    ;(async () => { try {
      const t0 = performance.now(), a0 = ((await run('getSlot', {}, keyVal)).json as any)?.result; if (typeof a0 !== 'number' || dead) return
      setAnchor({ slot: a0, at: performance.now() }); await new Promise(r => setTimeout(r, 2400)); if (dead) return
      const t1 = performance.now(), a1 = ((await run('getSlot', {}, keyVal)).json as any)?.result
      if (typeof a1 === 'number' && a1 > a0) { const ms = (t1 - t0) / (a1 - a0); if (ms > 120 && ms < 700) setSlotMs(Math.round(ms / 10) * 10); if (!dead) setAnchor({ slot: a1, at: performance.now() }) }
    } catch { /* offline */ } })()
    return () => { dead = true }
  }, [keyVal, net])
  useEffect(() => { if (arrived) setPane('res') }, [arrived])
  const doRun = async () => { setBusy(true); setErr(''); setRes(null); setPane('req'); setRunId(x => x + 1); try { const r = await run(method, vals, keyVal); setRes(r); const sl = (r.json as any)?.result?.context?.slot ?? (method === 'getTransaction' ? (r.json as any)?.result?.slot : null); if (typeof sl === 'number') setAnchor({ slot: sl, at: performance.now() }) } catch (e) { setRes(null); setErr(e instanceof Error ? e.message : 'The request failed.') } finally { setBusy(false) } }
  return (
    <div className="page enter">
      <div className="ph-row"><div className="ph-l"><h1>Playground</h1><span className="badge static">API key added</span></div><NetSeg n={net} set={onNet} /></div>
      <div className="body" ref={bodyRef}>
        <div className="lbox" ref={lboxRef}>
          <div className="lform">
            <div className="lrow">
              <div className="blk grow"><label className="lbl">Method</label><Combobox value={method} onChange={m => { setMethod(m); setRes(null); setErr(''); setPane('req') }} /></div>
              <button ref={runRef} className="btn run" style={{ width: 56, minWidth: 56 }} onClick={doRun} disabled={busy || miss.length > 0} aria-label={busy ? 'Running' : 'Run'} title="Run">{busy ? <i className="spin w" /> : <Play size={16} fill="currentColor" />}</button>
            </div>
            <div className={`xf${fields.length ? ' open' : ''}`} aria-hidden={!fields.length}><div className="xin">
              {shown.map(f => <div key={method + f.key} className="blk fin"><label className="lbl" htmlFor={f.key}>{f.label}</label><input id={f.key} className="input mono" value={vals[f.key] ?? ''} placeholder={f.placeholder} onChange={e => setVals(x => ({ ...x, [f.key]: e.target.value }))} spellCheck={false} tabIndex={fields.length ? 0 : -1} />
                {(f.key === 'signature' || f.key === 'message') && <button type="button" className="helper" disabled={helping} tabIndex={fields.length ? 0 : -1} onClick={() => help(f.key)}>{helping ? 'Working…' : f.key === 'signature' ? 'Use a random recent signature' : 'Generate a sample message'}</button>}</div>)}
              {helpErr && <p className="helper-err">{helpErr}</p>}
            </div></div>
          </div>
          <div className="lterm">
            <div className="lterm-h"><div className="pills" role="tablist"><button role="tab" aria-selected={pane === 'req'} className={pane === 'req' ? 'on' : ''} onClick={() => setPane('req')}>Request</button><button role="tab" aria-selected={pane === 'res'} className={pane === 'res' ? 'on' : ''} onClick={() => setPane('res')}>Response</button></div>
              <div className="tools">{pane === 'res' && arrived && res && <div className="meta"><b className={res.status < 300 ? 'ok' : 'bad'}>{res.status}</b><span>{res.ms} ms</span></div>}
                <button className={`iconbtn${wrap ? ' on' : ''}`} aria-label="Toggle line wrap" aria-pressed={wrap} onClick={() => setWrap(w => !w)}><WrapText size={15} /></button>
                <button className="iconbtn" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(pane === 'req' ? copyText : JSON.stringify(res?.json, null, 2) || ''); setCopied(true); setTimeout(() => setCopied(false), 1400) }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
                {pane === 'req' && <div className="lang"><button className="langbtn" onClick={e => { e.stopPropagation(); setLangOpen(o => !o) }}><Terminal size={14} />{lang === 'curl' ? 'cURL' : 'TypeScript'}<ChevronsUpDown size={12} /></button>
                  {langOpen && <div className="lang-m">{(['curl', 'ts'] as const).map(l => <button key={l} onClick={() => { setLang(l); setLangOpen(false) }}>{l === 'curl' ? 'cURL' : 'TypeScript'}{lang === l && <Check size={14} />}</button>)}</div>}</div>}</div></div>
            <div ref={termRef} className={`lterm-b${arrived ? ' got' : ''}${busy ? ' wait' : ''}`}>
              {pane === 'req' ? <Code text={text} wrap={wrap} /> : arrived ? (err ? <div className="empty bad">{err}</div> : res ? <Code text={typeof res.json === 'string' ? res.json : JSON.stringify(res.json, null, 2)} wrap={wrap} json /> : null) : <div className="empty">{busy ? `Waiting for ${method}…` : 'Run a method and the answer lands here.'}</div>}
            </div>
          </div>
        </div>
        <Journey method={method} vals={vals} net={net} runId={runId} resp={res} err={err} slotAnchor={anchor} slotMs={slotMs} bodyRef={bodyRef} lboxRef={lboxRef} runRef={runRef} termRef={termRef} onArrived={setArrived} />
      </div>
    </div>
  )
}

export function App() {
  const [net, setNetState] = useState<Net>(getNet())
  setNet(net)
  const choose = (n: Net) => { try { localStorage.setItem(NET_STORE, n) } catch { /* private mode */ } setNet(n); setNetState(n) }
  return <main className="main"><Page net={net} setNet={choose} /></main>
}
