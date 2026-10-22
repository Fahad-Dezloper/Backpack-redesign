import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Info, Move, RotateCcw } from 'lucide-react'
import { credits as usedCredits } from '../rpc'
import { Path, type Cubic, type Pt, clamp01, easeInOut, easeOut, fmt, hash01, line, seg } from './engine'

/* ------------------------------------------------------------------ constants */
const ACC = '#e8452b', GREEN = '#34c171', VIOLET = '#e8452b', AMBER = '#e0a43a', INK = '#edeef0', MUTE = '#8d8d95', EDGE = 'rgba(255,255,255,.13)'
const P = { send: [0, 700], gate: [700, 1500], route: [1500, 2100], work: [2100, 4400], ret: [4400, 5700], pay: [5700, 6500] } as const
const HOLD = P.work[1], TOTAL = P.pay[1]
export const ANIMATED = ['getAccountInfo', 'getLatestBlockhash', 'getTransaction', 'getSignaturesForAddress']
type Mod = 'state' | 'bh' | 'tx' | 'addr'
type Box4 = { x: number; y: number; w: number; h: number }
const MW = 200, MH = 148, GAP = 16, C1 = 170, C2 = C1 + MW + GAP, R1 = 232, R2 = R1 + MH + GAP, R3 = R2 + MH + GAP // every box is the same size, 14 of padding on all four sides
const MOD: Record<Mod, Box4 & { title: string }> = {
  state: { x: C1, y: R1, w: MW, h: MH, title: 'ACCOUNT STATE' }, bh: { x: C2, y: R1, w: MW, h: MH, title: 'RECENT BLOCKHASHES' },
  tx: { x: C1, y: R2, w: MW, h: MH, title: 'LEDGER · TX INDEX' }, addr: { x: C2, y: R2, w: MW, h: MH, title: 'ADDRESS INDEX' }
}
const GATE: Box4 = { x: 0, y: (R1 + R3 + MH) / 2 - 65, w: 130, h: 130 }
const METHOD_MOD: Record<string, Mod> = { getAccountInfo: 'state', getLatestBlockhash: 'bh', getTransaction: 'tx', getSignaturesForAddress: 'addr' }

const pt = (x: number, y: number): Pt => ({ x, y })
function rounded(points: Pt[], r: number): Cubic[] {
  const out: Cubic[] = []; let cur = points[0]; const unit = (a: Pt, b: Pt) => { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return pt((b.x - a.x) / d, (b.y - a.y) / d) }
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], c = points[i], b = points[i + 1], d1 = unit(a, c), d2 = unit(c, b), rr = Math.min(r, Math.hypot(c.x - a.x, c.y - a.y) / 2, Math.hypot(b.x - c.x, b.y - c.y) / 2)
    const pin = pt(c.x - d1.x * rr, c.y - d1.y * rr), pout = pt(c.x + d2.x * rr, c.y + d2.y * rr)
    out.push(line(cur, pin)); out.push([pin, pt(pin.x + d1.x * rr * .5523, pin.y + d1.y * rr * .5523), pt(pout.x - d2.x * rr * .5523, pout.y - d2.y * rr * .5523), pout]); cur = pout
  }
  out.push(line(cur, points[points.length - 1])); return out
}
/* ---- layout: every part of the canvas can be moved and scaled in edit mode; routes follow ---- */
type Item = 'gate' | 'state' | 'bh' | 'tx' | 'addr' | 'validators' | 'title'
type Place = { dx: number; dy: number; s: number }
type Layout = Partial<Record<Item, Place>>
const NAT: Record<Item, Box4> = {
  gate: GATE, state: MOD.state, bh: MOD.bh, tx: MOD.tx, addr: MOD.addr,
  validators: { x: 170, y: 0, w: 620, h: 206 }, title: { x: C1, y: R1 - 28, w: MW * 2 + GAP, h: 22 }
}
const ITEMS = Object.keys(NAT) as Item[]
const eff = (it: Item, L: Layout): Box4 => {
  const n = NAT[it], p = L[it]; if (!p) return n
  return { x: n.x + p.dx, y: n.y + p.dy, w: n.w * p.s, h: n.h * p.s }
}
/* the layout you chose in the editor, baked in */
const DEFAULT_L: Layout = { validators: { dx: -71, dy: 0, s: 0.9 } }
const BND = { x: -12, y: -14, w: 681, h: 734 } // fixed on purpose: the canvas scale must not change when a box is added or removed
const LAYOUT_KEY = 'helius-playground-layout-v3'
const loadLayout = (): Layout => { try { const v = localStorage.getItem(LAYOUT_KEY); return v ? (JSON.parse(v) as Layout) : DEFAULT_L } catch { return DEFAULT_L } }
function At({ it, L, children }: { it: Item; L: Layout; children: ReactNode }) {
  const n = NAT[it], p = L[it]
  return p ? <g transform={`translate(${n.x + p.dx} ${n.y + p.dy}) scale(${p.s}) translate(${-n.x} ${-n.y})`}>{children}</g> : <g>{children}</g>
}

/* orthogonal routing from the Helius Edge to a module, around the other modules */
const hitSeg = (a: Pt, b: Pt, r: Box4, pad = 3) => Math.max(a.x, b.x) > r.x - pad && Math.min(a.x, b.x) < r.x + r.w + pad && Math.max(a.y, b.y) > r.y - pad && Math.min(a.y, b.y) < r.y + r.h + pad
const plen = (a: Pt[]) => a.reduce((n, p, i) => (i ? n + Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) : 0), 0)
const elbow = (x: number, y1: number, y2: number): Pt[] => (Math.abs(y1 - y2) < 1.5 ? [] : [pt(x, y1), pt(x, y2)])
function routeTo(gate: Box4, m: Box4, others: Box4[]): Pt[] {
  const gc = pt(gate.x + gate.w / 2, gate.y + gate.h / 2), gr = pt(gate.x + gate.w, gc.y), mc = pt(m.x + m.w / 2, m.y + m.h / 2)
  const bus = Math.min(gr.x + 26, m.x - 10), busT = Math.min(gr.x + 26, mc.x - 10)
  const cands: Pt[][] = [
    [gc, gr, pt(bus, gr.y), pt(bus, mc.y), pt(m.x, mc.y)],
    [gc, gr, pt(busT, gr.y), pt(busT, m.y - 7), pt(mc.x, m.y - 7), pt(mc.x, m.y)],
    [gc, gr, pt(busT, gr.y), pt(busT, m.y + m.h + 7), pt(mc.x, m.y + m.h + 7), pt(mc.x, m.y + m.h)]
  ].map(c => c.filter((p, i) => i === 0 || Math.hypot(p.x - c[i - 1].x, p.y - c[i - 1].y) > 0.5))
  const ok = (c: Pt[]) => !c.some((p, i) => i > 1 && others.some(o => hitSeg(c[i - 1], p, o)))
  const pool = cands.filter(ok), use = pool.length ? pool : cands
  return use.sort((a, b) => plen(a) - plen(b))[0]
}
function buildPaths(mod: Mod, ao: Pt, ai: Pt, L: Layout) {
  const gate = eff('gate', L), m = eff(mod, L), others = ([...(Object.keys(MOD) as Mod[]).filter(k => k !== mod), ] as Item[]).map(k => eff(k, L))
  const route = routeTo(gate, m, others), gc = route[0]
  const xo = ao.x + (gate.x - ao.x) * 0.5, xi = ai.x + (gate.x - ai.x) * 0.5
  const toGw = [ao, ...elbow(xo, ao.y, gc.y), gc], tail = [...elbow(xi, gc.y, ai.y), ai]
  return {
    out: new Path(rounded([...toGw, ...route.slice(1)], 10)), toGw: plen(toGw),
    ret: new Path(rounded([...[...route].reverse(), ...tail], 10)),
    err: new Path(rounded([gc, ...tail], 10)),
    net: new Path(rounded([gc, ...elbow(xo, gc.y, ao.y), ao], 10))
  }
}

/* ------------------------------------------------------------------ response facts */
export type Resp = { status: number; ms: number; json: unknown } | null
type J = { result?: any; error?: { code?: number; message?: string } }
const short = (s: string) => (s && s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)
function kindOf(resp: Resp, err: string): 'pending' | 'ok' | 'gateway' | 'node' | 'network' {
  if (err) return 'network'; if (!resp) return 'pending'
  const j = resp.json as J; const code = j?.error?.code
  if (resp.status === 401 || resp.status === 403 || resp.status === 429 || code === -32001 || code === -32005) return 'gateway'
  if (j?.error) return 'node'; return 'ok'
}
export function slotOf(method: string, json: unknown): number | null { const j = json as J; if (method === 'getTransaction') return j?.result?.slot ?? null; return j?.result?.context?.slot ?? null }
function facts(method: string, resp: Resp): { k: string; v: string }[] {
  if (!resp) return []; const j = resp.json as J, r = j?.result
  if (j?.error) return [{ k: 'error', v: `${j.error.code ?? ''} ${j.error.message ?? ''}`.trim() }]
  switch (method) {
    case 'getAccountInfo': { if (r?.value == null) return [{ k: 'context.slot', v: fmt(r?.context?.slot ?? 0) }, { k: 'value', v: 'null: no such account' }]; const l = Number(r.value.lamports); return [{ k: 'context.slot', v: fmt(r.context.slot) }, { k: 'lamports', v: `${fmt(l)} (${(l / 1e9).toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL)` }, { k: 'owner', v: short(r.value.owner) }, { k: 'space', v: `${fmt(r.value.space ?? 0)} bytes` }] }
    case 'getLatestBlockhash': return [{ k: 'context.slot', v: fmt(r?.context?.slot ?? 0) }, { k: 'blockhash', v: short(r?.value?.blockhash ?? '') }, { k: 'lastValidBlockHeight', v: fmt(r?.value?.lastValidBlockHeight ?? 0) }]
    case 'getTransaction': return r ? [{ k: 'slot', v: fmt(r.slot) }, { k: 'fee', v: `${fmt(r.meta?.fee ?? 0)} lamports` }, { k: 'status', v: r.meta?.err ? 'failed' : 'succeeded' }] : [{ k: 'result', v: 'null: not found at this commitment' }]
    case 'getSignaturesForAddress': { const a: { slot: number }[] = Array.isArray(r) ? r : []; const slots = [...new Set(a.map(x => x.slot))]; return [{ k: 'signatures', v: String(a.length) }, { k: 'distinct slots', v: String(slots.length) }, ...(a.length ? [{ k: 'newest slot', v: fmt(a[0].slot) }] : [])] }
    case 'getFeeForMessage': return r?.value == null ? [{ k: 'value', v: 'null: blockhash no longer valid' }, { k: 'context.slot', v: fmt(r?.context?.slot ?? 0) }] : [{ k: 'fee', v: `${fmt(r.value)} lamports` }, { k: 'context.slot', v: fmt(r.context?.slot ?? 0) }]
    default: return [{ k: 'context.slot', v: r?.context?.slot ? fmt(r.context.slot) : '—' }]
  }
}
function sigSlots(json: unknown): number[] { const r = (json as J)?.result; return Array.isArray(r) ? [...new Set<number>(r.map((x: { slot: number }) => x.slot))].slice(0, 6) : [] }

/* ------------------------------------------------------------------ narration */
type Step = { at: number; text: string; tag: 'protocol' | 'documented' | 'illustrative' | 'measured' }
function stepsFor(method: string, resp: Resp, kind: string, net: string): Step[] {
  const base: Step[] = [
    { at: 0, text: `You send a JSON-RPC request over HTTPS to ${net}.helius-rpc.com.`, tag: 'protocol' },
    { at: 700, text: 'Helius’s edge gateway checks your key and your plan’s rate limit, and charges 1 credit.', tag: 'documented' }
  ]
  if (kind === 'gateway') return [...base, { at: 1500, text: 'The gateway turns the request away before it ever reaches a node. The error comes straight back.', tag: 'measured' }]
  if (kind === 'network') return [...base.slice(0, 1), { at: 700, text: 'The request never made it: the browser could not reach Helius.', tag: 'measured' }]
  base.push({ at: 1500, text: 'It hands the request to an RPC node.', tag: 'illustrative' })
  const m: Record<string, Step[]> = {
    getAccountInfo: [{ at: 2100, text: 'The node looks your address up in its account index.', tag: 'protocol' }, { at: 3200, text: 'It looks the account up in its own copy of the state. No block is scanned and no validator is asked.', tag: 'protocol' }],
    getLatestBlockhash: [{ at: 2100, text: 'The node reads its list of recent blockhashes, kept in memory.', tag: 'protocol' }, { at: 3200, text: 'It reads the newest entry of its list of recent blockhashes. That list lives in memory, and each hash is valid for 150 slots .', tag: 'protocol' }],
    getTransaction: [{ at: 2100, text: 'The node looks your signature up in its transaction index to find which slot it landed in.', tag: 'protocol' }, { at: 3200, text: 'It reads that one slot from its local ledger. Anything older than the node keeps is fetched from an archive instead.', tag: 'protocol' }],
    getSignaturesForAddress: [{ at: 2100, text: 'The node opens its per-address index, newest first. It does not scan blocks.', tag: 'protocol' }, { at: 3200, text: `It walks the index and gathers up to 1,000 signatures. Each one points at a slot${resp ? `: here ${sigSlots(resp.json).length || 'no'} different slots` : ''}.`, tag: 'protocol' }],
    getFeeForMessage: [{ at: 2100, text: 'The node decodes your message and checks its blockhash is still one of the recent 150.', tag: 'protocol' }, { at: 3200, text: 'It adds 5,000 lamports per signature plus any priority fee. Pure arithmetic: nothing is read from disk.', tag: 'protocol' }]
  }
  base.push(...(m[method] ?? [{ at: 2100, text: 'The node reads its own local copy of the chain. (This method has no dedicated animation yet.)', tag: 'protocol' as const }]))
  base.push({ at: 4400, text: kind === 'node' ? 'The node returns an error. It travels back the same way.' : 'The answer travels back the way it came.', tag: resp ? 'measured' : 'illustrative' })
  return base
}

/* ------------------------------------------------------------------ small svg helpers */
const T = ({ x, y, children, size = 11, fill = MUTE, anchor = 'start', mono = false, weight = 400, ls, op }: { x: number; y: number; children: ReactNode; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; mono?: boolean; weight?: number; ls?: number; op?: number }) =>
  <text x={x} y={y} fontSize={size} fill={fill} opacity={op} textAnchor={anchor} fontWeight={weight} letterSpacing={ls} fontFamily={mono ? "'IBM Plex Mono', ui-monospace, monospace" : "'Inter Variable', Inter, sans-serif"}>{children}</text>
function Panel({ x, y, w, h, r = 2, lit = 0, color = ACC, dash, draw = false }: Box4 & { r?: number; lit?: number; color?: string; dash?: string; id?: string; draw?: boolean }) {
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={r} fill={lit > 0.01 ? '#1d1d22' : '#17171b'} />
    <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={r} fill="none" stroke={lit > 0.05 && !draw ? color : '#2e2d33'} strokeOpacity={lit > 0.05 && !draw ? 0.5 + 0.5 * lit : 1} strokeWidth={1} strokeDasharray={dash} />
    {draw && lit > 0.01 && <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={r} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" pathLength={1} strokeDasharray={`${Math.min(1, lit * 1.1)} 1`} />}
  </g>
}
function Arrow({ path, color }: { path: Path; color: string }) {
  const e = path.at(1), q = path.at(0.97), dx = e.x - q.x, dy = e.y - q.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, px = -uy, py = ux
  return <path d={`M${e.x} ${e.y} L${e.x - ux * 7 + px * 3.6} ${e.y - uy * 7 + py * 3.6} L${e.x - ux * 7 - px * 3.6} ${e.y - uy * 7 - py * 3.6} Z`} fill={color} />
}
function Packet({ p, color, trail }: { p: Pt; color: string; trail: { p: Pt; a: number }[] }) {
  return <g>{trail.map((q, i) => <circle key={i} cx={q.p.x} cy={q.p.y} r={3.4 - i * 0.4} fill={color} opacity={q.a} />)}<circle cx={p.x} cy={p.y} r={4} fill={color} /></g>
}
const hexPath = (cx: number, cy: number, r: number) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k - Math.PI / 6; return `${k ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}` }).join(' ') + 'Z'

/* ------------------------------------------------------------------ cluster: validators on top */
const VP: Pt[] = (() => { const out: Pt[] = []; for (let k = 0; k < 600 && out.length < 13; k++) { const c = pt(196 + hash01('px', k) * 548, 46 + hash01('py', k) * 124); if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 66)) out.push(c) } return out })() // scattered, never on a grid
const NV = VP.length
const VR = VP.map((_, i) => 7 + Math.round(hash01('stake', i) * 7)) // size follows stake, illustrative
const EDGES: [number, number][] = (() => { const set = new Map<string, [number, number]>(); VP.forEach((a, i) => VP.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) })).filter(o => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 2).forEach(o => { const k = [i, o.j].sort().join('-'); set.set(k, [Math.min(i, o.j), Math.max(i, o.j)]) })); return [...set.values()] })()
const HUB = pt(473, 198)
const FAN = VP.map(v => new Path([[v, pt(v.x, v.y + 34), pt(HUB.x + (v.x - HUB.x) * 0.3, 182), HUB] as Cubic], 24))
const hops = (src: number) => { const d = Array(NV).fill(99) as number[]; d[src] = 0; const q = [src]; while (q.length) { const a = q.shift()!; EDGES.forEach(([x, y]) => { const o = x === a ? y : y === a ? x : -1; if (o >= 0 && d[o] > d[a] + 1) { d[o] = d[a] + 1; q.push(o) } }) } return d }
const HOPS = VP.map((_, i) => hops(i))
const tail6 = (n: number) => { const x = String(n).slice(-6); return `${x.slice(0, 3)},${x.slice(3)}` }
const hex4 = (n: number) => Math.floor(hash01(String(n), 7) * 65535).toString(16).padStart(4, '0')

function Validators({ now, slot, f, slotMs }: { now: number; slot: number | null; f: number; slotMs: number }) {
  const s = slot ?? Math.floor(now / slotMs), leader = Math.floor(s / 4) % NV, dist = HOPS[leader], g = ((s % 4) + f) / 4 // one slow wave per leader turn
  const seen = (i: number) => clamp01((g - dist[i] * 0.2) / 0.25)
  return <g>
    <T x={170} y={12} size={11} fill={INK} ls={0.8} weight={500}>VALIDATORS</T>
    {EDGES.map(([a, b], i) => { const A = VP[a], B = VP[b], da = dist[a], db = dist[b], from = da <= db ? A : B, to = da <= db ? B : A, k = clamp01((g - Math.min(da, db) * 0.2) / 0.28)
      return <g key={i}><line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={VIOLET} strokeOpacity={0.14} />{da !== db && k > 0 && k < 1 && <circle cx={from.x + (to.x - from.x) * k} cy={from.y + (to.y - from.y) * k} r={2} fill={VIOLET} opacity={0.8} />}</g> })}
    {FAN.map((fp, i) => <path key={i} d={fp.d} fill="none" stroke={VIOLET} strokeOpacity={0.5} strokeWidth={1.1} strokeDasharray="3 4" strokeDashoffset={-(now / 90) % 7} />)}
    {VP.map((v, i) => { const isL = i === leader, r = VR[i], a = seen(i)
      return <g key={i}>
        <path d={hexPath(v.x, v.y, r)} fill="#171717" stroke={VIOLET} strokeOpacity={isL ? 1 : 0.45 + 0.4 * a} strokeWidth={isL ? 1.6 : 1.2} />
        <path d={hexPath(v.x, v.y, r * 0.5)} fill={VIOLET} fillOpacity={isL ? 0.95 : 0.22 + 0.5 * a} />
        {isL && <T x={v.x} y={v.y - r - 12} size={9.5} mono anchor="middle" fill={VIOLET}>leader</T>}</g> })}
    <line x1={HUB.x} y1={HUB.y} x2={HUB.x} y2={250} stroke={VIOLET} strokeOpacity={0.9} strokeWidth={1.6} />
    <circle cx={HUB.x} cy={HUB.y} r={5} fill="#171717" stroke={VIOLET} strokeWidth={1.4} /><circle cx={HUB.x} cy={HUB.y} r={2} fill={VIOLET} />
    <circle cx={HUB.x} cy={HUB.y + 4 + 22 * easeInOut(f)} r={2.4} fill={VIOLET} opacity={Math.sin(Math.PI * f)} />
  </g>
}
/* ------------------------------------------------------------------ the scene */
function Scene(p: { method: string; vals: Record<string, string>; t: number; now: number; slot: number | null; sf: number; resp: Resp; kind: string; playing: boolean; idle: boolean; aOut: Pt; aIn: Pt; L: Layout; slotMs: number; reduce: boolean; onTip: (m: Mod | null, el: Element | null) => void }) {
  const { method, t, now, resp, kind, idle, L, slotMs } = p
  const mod = METHOD_MOD[method] ?? 'state'
  const geo = useMemo(() => buildPaths(mod, p.aOut, p.aIn, L), [mod, Math.round(p.aOut.x), Math.round(p.aOut.y), Math.round(p.aIn.x), Math.round(p.aIn.y), JSON.stringify(L)])
  const path = geo.out, u1 = path.frac(geo.toGw)
  const gwErr = kind === 'gateway', netErr = kind === 'network'
  const rpath = gwErr ? geo.err : netErr ? geo.net : geo.ret
  const pSend = easeInOut(seg(t, ...P.send)), pRoute = easeInOut(seg(t, ...P.route)), pWork = seg(t, ...P.work), pRet = easeInOut(seg(t, ...P.ret))
  const running = !idle, f = p.sf
  let u = 0, color = '#fafafa', showPacket = running
  if (t < P.gate[0]) u = pSend * u1
  else if (t < P.route[0]) u = u1
  else if (t < P.work[0]) u = lerpU(u1, 1, pRoute)
  else if (t < P.ret[0]) u = 1
  const inRet = t >= P.ret[0]
  if (inRet) { color = kind === 'ok' || kind === 'pending' ? GREEN : '#ff6a55'; u = pRet }
  if (t >= P.ret[1]) showPacket = false
  if (!resp && !p.idle && inRet && !netErr) showPacket = false
  const cur = inRet ? rpath : path
  const pk = cur.at(u), trail = Array.from({ length: 6 }, (_, i) => ({ p: cur.at(u - (i + 1) * (inRet ? 0.016 : 0.012)), a: Math.max(0, 0.5 - i * 0.09) }))
  const dashOut = running ? (inRet ? (gwErr || netErr ? u1 : 1) : u) : 0, dashRet = running && inRet ? pRet : 0, bad = gwErr || netErr
  const lit = running ? easeOut(seg(t, P.route[0] + 250, P.route[1] + 350)) * (1 - seg(t, P.ret[0] + 500, P.ret[1] + 300) * (kind === 'ok' ? 1 : 0)) : 0
  const idleGlow = idle ? 0.45 : 0, waiting = running && t >= HOLD && !resp, pulse = 0.5 + 0.5 * Math.sin(now / 260)
  const gc = [0, 1, 2].map(i => easeOut(seg(t, P.gate[0] + 120 + i * 200, P.gate[0] + 320 + i * 200)))
  const gwLit = running ? (t >= P.send[1] - 120 && t < P.route[0] + 100 ? 1 : 0.0) : 0
  const scan = running ? seg(t, P.gate[0], P.gate[1]) : 0
  const amb = 0.7 - (running ? 0.42 * easeOut(seg(t, 0, 500)) * (1 - easeOut(seg(t, P.ret[1], P.ret[1] + 500))) : 0) // the cluster steps back while your request is the story
  const frz = useRef<number | null>(null) // the blockhash queue stops mid-growth the moment your request reaches it
  if (running && mod === 'bh' && t >= P.work[0] && t < P.pay[0] + 600) { if (frz.current === null) frz.current = f } else frz.current = null
  const bhPh = frz.current ?? f
  const fl = (i: number) => (running || p.reduce ? 0 : Math.sin(now / (2300 + i * 430)) * 1.1) // barely-there idle drift, a different tempo for every part
  const retTone = kind === 'ok' || kind === 'pending' ? GREEN : '#ff6a55'
  return (
    <g>
      <g data-amb opacity={amb}><At it="validators" L={L}><g data-comp="validators" transform={`translate(0 ${fl(0)})`}><Validators now={now} slot={p.slot} f={f} slotMs={slotMs} /></g></At></g>
      {/* node: no frame, just its name and a quiet status */}
      <At it="title" L={L}><T x={C1} y={R1 - 12} size={12} fill={INK} ls={0.9} weight={500}>HELIUS RPC NODE</T></At>
      {/* route (under the boxes, so it passes behind the edge and into modules) */}
      <path d={path.d} fill="none" stroke="white" strokeOpacity={0.16} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="0.1 4.5" />
      <path d={geo.ret.d} fill="none" stroke="white" strokeOpacity={0.16} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="0.1 4.5" />
      {running && <g><mask id="mk-out" maskUnits="userSpaceOnUse" x={-1500} y={-1500} width={4000} height={4000}><path d={path.d} fill="none" stroke="white" strokeWidth={8} strokeDasharray={`${Math.max(0, dashOut) * path.length} ${path.length}`} /></mask>
        <path d={path.d} fill="none" stroke={bad ? '#ff6a55' : ACC} strokeWidth={1.8} strokeLinecap="round" strokeDasharray="0.1 4.5" mask="url(#mk-out)" />{dashOut > 0.985 && <Arrow path={path} color={bad ? '#ff6a55' : ACC} />}</g>}
      {running && dashRet > 0 && <g><mask id="mk-ret" maskUnits="userSpaceOnUse" x={-1500} y={-1500} width={4000} height={4000}><path d={rpath.d} fill="none" stroke="white" strokeWidth={8} strokeDasharray={`${dashRet * rpath.length} ${rpath.length}`} /></mask>
        <path d={rpath.d} fill="none" stroke={retTone} strokeWidth={2} strokeLinecap="round" strokeDasharray="0.1 4.5" mask="url(#mk-ret)" />{dashRet > 0.985 && <Arrow path={rpath} color={retTone} />}</g>}
      {[p.aOut, p.aIn].map((q, i) => { const ring = i === 0 ? 1 - seg(t, 0, 700) : easeOut(seg(t, P.ret[1] - 150, P.ret[1] + 450)), c = i === 1 && !(kind === 'ok') && running ? '#ff6a55' : i === 0 ? ACC : GREEN
        return <g key={i}><circle cx={q.x} cy={q.y} r={4} fill="#0d0c0f" stroke={running && (i === 0 || t > P.ret[1] - 200) ? c : MUTE} strokeWidth={1.4} />{running && ring > 0 && ring < 1 && <circle cx={q.x} cy={q.y} r={4 + 14 * (i === 0 ? 1 - ring : ring)} fill="none" stroke={c} strokeOpacity={i === 0 ? ring * 0.6 : (1 - ring) * 0.7} />}</g> })}
      <At it="gate" L={L}><g data-comp="gate" transform={`translate(0 ${fl(2)})`}><Gateway credits={usedCredits()} running={running} gwLit={gwLit} bad={gwErr && t > P.gate[1] - 200} gc={gc} scan={scan} rate={resp && (resp.json as J)?.error?.code === -32005} gwErr={gwErr} /></g></At>
      {(Object.keys(MOD) as Mod[]).map((m, mi) => {
        const M = MOD[m], on = m === mod, l = on ? Math.max(lit, idleGlow) : 0
        return <At key={m} it={m} L={L}><g data-comp={m} transform={`translate(0 ${fl(3 + mi)})`} opacity={on ? 1 : running ? 0.6 : 0.85}><Panel {...M} lit={l} draw={running} /><T x={M.x + 14} y={M.y + 22} size={10.5} fill={on && l > 0.2 ? INK : MUTE} ls={0.6} weight={500}>{M.title}</T><g tabIndex={0} role="button" aria-label={`About ${M.title.toLowerCase()}`} pointerEvents="all" style={{ cursor: 'help', outline: 'none' }} onMouseEnter={e => p.onTip(m, e.currentTarget)} onMouseLeave={() => p.onTip(null, null)} onFocus={e => p.onTip(m, e.currentTarget)} onBlur={() => p.onTip(null, null)}><circle cx={M.x + M.w - 20} cy={M.y + 17.5} r={11} fill="transparent" /><circle cx={M.x + M.w - 20} cy={M.y + 17.5} r={6} fill="none" stroke={MUTE} strokeOpacity={0.8} strokeWidth={1.1} /><circle cx={M.x + M.w - 20} cy={M.y + 14.7} r={0.8} fill={MUTE} /><path d={`M${M.x + M.w - 20} ${M.y + 16.9} v3.2`} stroke={MUTE} strokeWidth={1.2} strokeLinecap="round" /></g>
          <ModBody m={m} t={t} on={on} pWork={pWork} f={bhPh} vals={p.vals} resp={resp} running={running} slotMs={slotMs} /></g></At>
      })}
      {showPacket && !waiting && <Packet p={pk} color={color} trail={trail} />}
      {showPacket && waiting && <g><Packet p={pk} color={color} trail={[]} /><circle cx={pk.x} cy={pk.y} r={10 + 8 * pulse} fill="none" stroke={ACC} strokeOpacity={0.5 * (1 - pulse)} /></g>}
      {running && <ErrorChip kind={kind} t={t} resp={resp} gate={eff('gate', L)} />}
    </g>
  )
}
const TIPS: Record<Mod, { title: string; body: string }> = {
  state: { title: 'Account state', body: 'Solana keeps every account in a key-value store. A 32-byte address maps to one record: the lamports balance, the owner program, the data bytes and whether it is executable. getAccountInfo looks the address up in an index that points to that record.' },
  bh: { title: 'Recent blockhashes', body: 'The node keeps a queue of recent blockhashes, newest first. A transaction has to reference one, and it expires 150 slots after it was created, roughly a minute. getLatestBlockhash returns the newest one and the last block height where it is still valid.' },
  tx: { title: 'Ledger · transaction index', body: 'The ledger indexes every transaction signature to the slot it landed in. getTransaction looks the signature up, finds that one slot, and reads the transaction from it.' },
  addr: { title: 'Address index', body: 'A second index lists every signature that touched an address, newest first. getSignaturesForAddress walks that list, so its results can span many slots. It does not scan blocks.' },
}
const lerpU = (a: number, b: number, t: number) => a + (b - a) * t

function Gateway({ credits, running, gwLit, bad, gc, scan, rate, gwErr }: { credits: number; running: boolean; gwLit: number; bad: boolean; gc: number[]; scan: number; rate: boolean | null; gwErr: boolean }) {
  const G = GATE, col = bad ? '#ff6a55' : ACC, rows = [['API key', 'key'], ['Rate limit', 'gauge'], ['Credits', 'coin']] as const
  return <g>
    <Panel {...G} r={14} lit={gwLit} color={col} />
    <T x={G.x + 14} y={G.y + G.h - 9} size={9} mono fill={MUTE} op={0.8}>credits used · {credits}</T>
    <g transform={`translate(${G.x + 14} ${G.y + 12})`} stroke={INK} strokeWidth={1.3} fill="none" strokeLinejoin="round"><path d="M7 1 L13 3.5 V8 C13 11.5 10.5 13.5 7 15 C3.5 13.5 1 11.5 1 8 V3.5 Z" /></g>
    <T x={G.x + 34} y={G.y + 25} size={10.5} fill={INK} weight={500} ls={0.6}>HELIUS EDGE</T>
    {rows.map(([label, icon], i) => {
      const y = G.y + 52 + i * 26, a = running ? 0.35 + 0.65 * gc[i] : 0.5, isBad = gwErr && ((rate && i === 1) || (!rate && i === 0)), c = isBad ? '#ff6a55' : GREEN, done = running && gc[i] > 0.5
      return <g key={label} opacity={a}>
        <g transform={`translate(${G.x + 14} ${y - 9})`} stroke={isBad ? '#ff6a55' : MUTE} strokeWidth={1.2} fill="none" strokeLinecap="round">
          {icon === 'key' && <><circle cx={4} cy={6} r={3} /><path d="M6.5 7.5 L12 13 M10 11 L12 9" /></>}
          {icon === 'gauge' && <><path d="M1 11 A6 6 0 0 1 13 11" /><path d="M7 11 L10 6" /></>}
          {icon === 'coin' && <><circle cx={7} cy={7} r={5.5} /><path d="M7 4.5 V9.5" /></>}
        </g>
        <T x={G.x + 34} y={y + 2} size={10.5} mono fill={isBad ? '#ff6a55' : INK}>{label}</T>
        <T x={G.x + G.w - 14} y={y + 2} size={11} mono anchor="end" fill={done ? (i === 2 && !isBad ? INK : c) : MUTE}>{done ? (isBad ? '✕' : i === 2 ? '−1' : '✓') : '·'}</T>
        {i === 1 && <><rect x={G.x + 34} y={y + 8} width={82} height={2.5} rx={1.2} fill="white" fillOpacity={0.1} /><rect x={G.x + 34} y={y + 8} width={82 * 0.12 * (done ? 1 : 0)} height={2.5} rx={1.2} fill={c} /></>}
      </g>
    })}
    {running && scan > 0 && scan < 1 && <rect x={G.x + 6} y={G.y + 8 + (G.h - 16) * scan} width={G.w - 12} height={2} rx={1} fill={col} opacity={0.55 * Math.sin(Math.PI * scan)} />}
  </g>
}
function ErrorChip({ kind, t, resp, gate }: { kind: string; t: number; resp: Resp; gate: Box4 }) {
  if (kind !== 'gateway' && kind !== 'node' && kind !== 'network') return null
  const a = easeOut(seg(t, P.ret[0], P.ret[0] + 400)), j = resp?.json as J
  const txt = kind === 'network' ? 'could not reach Helius' : kind === 'gateway' ? `${resp?.status && resp.status !== 200 ? resp.status : j?.error?.code} ${j?.error?.code === -32005 ? 'rate limited' : 'rejected at the edge'}` : `node error ${j?.error?.code ?? ''}`
  return <g opacity={a}><rect x={gate.x + gate.w / 2 - 75} y={gate.y + gate.h + 12} width={150} height={24} rx={2} fill="#ff6a55" fillOpacity={0.1} stroke="#ff6a55" strokeOpacity={0.5} /><T x={gate.x + gate.w / 2} y={gate.y + gate.h + 28} size={11} mono anchor="middle" fill="#ff8f7e">{txt}</T></g>
}

/* ------------------------------------------------------------------ module internals: each one is drawn as what it really holds */
const msgSigs = (b64: string): number | null => { try { const bin = atob(b64.trim()); if (!bin.length) return null; const b0 = bin.charCodeAt(0), n = b0 & 0x80 ? bin.charCodeAt(1) : b0; return n > 0 && n < 64 ? n : null } catch { return null } }
function Identicon({ x, y, seed }: { x: number; y: number; seed: string }) {
  return <g><rect x={x} y={y} width={16} height={16} rx={1} fill="white" fillOpacity={0.06} />{Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => { const cc = c > 2 ? 4 - c : c; return hash01(seed, r * 3 + cc) > 0.5 ? <rect key={`${r}${c}`} x={x + 0.5 + c * 3} y={y + 0.5 + r * 3} width={2.4} height={2.4} rx={0.6} fill={INK} fillOpacity={0.85} /> : null }))}</g>
}
function ModBody({ m, t, on, pWork, f, vals, resp, running, slotMs }: { m: Mod; t: number; on: boolean; pWork: number; f: number; vals: Record<string, string>; resp: Resp; running: boolean; slotMs: number }) {
  /* every box: 14 of padding on all sides, a title row, content from y+34, and the last line ends at y+134 */
  function head3(frozen: boolean, hd: number, X: number, y: number) { return frozen && hd > 0.05 ? <path d={`M${X + 4} ${y + 76} l-3.5 5.5 h7 z`} fill={ACC} opacity={hd} /> : null }
  const M = MOD[m], x = M.x, y = M.y, X = x + 14, W = M.w - 28, p = on && running ? pWork : 0, st = (a: number, b: number) => easeOut(seg(p, a, b))
  if (m === 'state') {
    /* 1 the address arrives and is typed into the box  2 a cursor sweeps the index matrix, faster and faster  3 it stops on the entry  4 the record below fills in */
    const addr = (vals.address || '').trim(), res = (resp?.json as J)?.result, val = res?.value, have = !!resp && res !== undefined, COLS = 24, ROWS = 3, N = COLS * ROWS, cw = W / COLS
    const target = Math.floor(hash01(addr || '∅') * N), tcol = target % COLS, trow = Math.floor(target / COLS)
    const typing = on && running && t >= P.work[0], rev = typing ? easeOut(seg(pWork, 0, 0.15)) : 1, shown = addr.slice(0, Math.ceil(addr.length * rev))
    const sc = on && running ? seg(pWork, 0.15, 0.55) : 0, pos = target * sc * sc, chop = on && running ? seg(pWork, 0.55, 0.63) : 0, done = on && running && pWork >= 0.55
    const down = on && running ? easeOut(seg(pWork, 0.62, 0.72)) : 0, fill = (a: number, b: number) => (on && running ? easeOut(seg(pWork, a, b)) : 0)
    const f1 = fill(0.7, 0.8), f2 = fill(0.76, 0.86), f3 = fill(0.82, 0.92), f4 = fill(0.88, 0.97), cx = X + tcol * cw, my = y + 58 + trow * 10
    const sol = val?.lamports != null ? Number(val.lamports) / 1e9 : null
    return <g>
      <Identicon x={X} y={y + 34} seed={addr || '∅'} />
      <rect x={X + 22} y={y + 34} width={W - 22} height={16} rx={2} fill={ACC} fillOpacity={0.04 + (typing ? 0.12 * rev : 0)} stroke={ACC} strokeOpacity={typing ? 0.7 : 0.18} />
      <T x={X + 30} y={y + 45.5} size={9.5} mono fill={addr ? INK : MUTE}>{addr ? short(shown.length >= addr.length ? addr : shown) : 'paste an address'}</T>
      {typing && rev < 1 && <rect x={X + 30 + Math.min(shown.length, 14) * 5.7} y={y + 38} width={1.2} height={9} fill={ACC} />}
      {Array.from({ length: N }, (_, i) => { const r = Math.floor(i / COLS), c = i % COLS, hit = i === target, near = sc > 0 && !done && i <= pos && i > pos - 5, past = sc > 0 && i < pos
        return <rect key={i} x={X + c * cw + 0.7} y={y + 58 + r * 10} width={cw - 1.6} height={8} fill={hit && done ? ACC : near ? ACC : 'white'} fillOpacity={hit && done ? 0.95 : near ? 0.35 + 0.65 * (1 - (pos - i) / 5) : past && !done ? 0.18 : done ? 0.06 : hit && !on ? 0.5 : 0.1} /> })}
      {chop > 0 && <rect x={cx + 0.7 - 2 * Math.sin(Math.PI * chop)} y={y + 56} width={cw - 1.6 + 4 * Math.sin(Math.PI * chop)} height={ROWS * 10 + 1} fill="none" stroke={ACC} strokeWidth={1.2} strokeOpacity={Math.sin(Math.PI * chop)} />}
      <line x1={cx + cw / 2} y1={my + 8} x2={cx + cw / 2} y2={my + 8 + (y + 96 - my - 8) * down} stroke={ACC} strokeWidth={1.4} />
      <rect x={X} y={y + 96} width={W} height={38} rx={2} fill={ACC} fillOpacity={0.03 + 0.04 * down} stroke={ACC} strokeOpacity={0.12 + 0.6 * down} />
      <T x={X + 10} y={y + 112} size={11} mono weight={600} fill={INK} op={have ? f1 : 0.35}>{have ? (val == null ? 'no account here' : `${(sol! * f1).toLocaleString('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 0 })} SOL`) : '— SOL'}</T>
      <T x={X + W - 10} y={y + 112} size={9.5} mono anchor="end" fill={INK} op={have && val ? f2 : 0.35}>{have && val ? `${fmt(val.space ?? 0)} B data` : '— B data'}</T>
      <T x={X + 10} y={y + 127} size={9.5} mono fill={INK} op={have && val ? 0.9 * f3 : 0.35}>{have && val ? `owner ${short(val.owner)}` : 'owner —'}</T>
      <T x={X + W - 10} y={y + 127} size={9.5} mono anchor="end" fill={INK} op={have && val?.executable ? 0.9 * f4 : 0}>program</T>
    </g>
  }
  if (m === 'bh') {
    /* a new blockhash is added every slot, so the queue never stops growing at its head. Your request stops it, grabs the newest hash and lifts it out. */
    const N = 48, HW = 8, NW = 2, x0 = X + HW + 3, pitch = (W - HW - 3) / (N - 1), ph = f, frozen = on && running && t >= P.work[0] && t < P.pay[0] + 600
    const hd = st(0, 0.15), chip = st(0.2, 0.55), settle = st(0.55, 0.75), hash = (resp?.json as J)?.result?.value?.blockhash as string | undefined, lv = (resp?.json as J)?.result?.value?.lastValidBlockHeight as number | undefined, secs = Math.round((150 * slotMs) / 1000)
    const grow = frozen ? 1 - (1 - easeOut(ph)) * (1 - hd) : easeOut(ph) // while frozen the head finishes its growth
    return <g>
      {Array.from({ length: N + 1 }, (_, i) => {
        const e = easeInOut(ph), head = i === 0, second = i === 1
        const px = head ? X : second ? X + (x0 - X) * e : x0 + (i - 2 + ph) * pitch, w = head ? HW : second ? HW + (NW - HW) * e : NW, hgt = head ? 34 * grow : 34
        const age = Math.min(1, (i + ph) / N), op = i >= N ? 1 - ph : 1, hot = head && frozen && hd > 0.05
        return <rect key={i} x={px} y={y + 72 - hgt} width={w} height={hgt} fill={hot || (second && frozen) ? ACC : 'white'} fillOpacity={(head ? (frozen ? 0.65 + 0.35 * hd : 0.45 + 0.4 * ph) : second ? 0.85 - 0.45 * e : 0.08 + 0.5 * Math.pow(1 - age, 1.5)) * op} /> })}
      {head3(frozen, hd, X, y)}
      <path d={`M${X} ${y + 96} v4 h${W} v-4`} fill="none" stroke="white" strokeOpacity={0.25} /><T x={X + W / 2} y={y + 114} size={9} mono anchor="middle" fill={MUTE}>valid for 150 slots · ~{secs} s</T>
      {frozen && chip > 0 && <g opacity={Math.min(1, chip * 2)}><rect x={X} y={y + 62 + (y + 119 - (y + 62)) * chip} width={78} height={14} rx={2} fill={ACC} fillOpacity={0.14} stroke={ACC} strokeOpacity={0.8} /><T x={X + 8} y={y + 62 + 57 * chip + 10.5} size={9} mono fill={INK}>{hash ? short(hash) : '…'}</T></g>}
      <T x={X + W} y={y + 132} size={9} mono anchor="end" fill={INK} op={frozen && settle > 0 && lv ? settle : 0}>{lv ? `until ${fmt(lv)}` : ''}</T>
    </g>
  }
  if (m === 'tx') {
    /* 1 the signature arrives and is typed in  2 a strip of ledger slots scrolls under a fixed marker, faster and faster, leaving a mark on each slot it passed
       3 it overshoots the right slot and springs back onto it  4 the slot is selected and the transaction is read from it */
    const sig = (vals.signature || '').trim(), res = (resp?.json as J)?.result, have = !!resp && res !== undefined, rs = res?.slot as number | undefined, fee = res?.meta?.fee as number | undefined
    const NT = 30, TW = 26, target = 9 + Math.floor(hash01(sig || '∅', 5) * 14)
    const typing = on && running && t >= P.work[0], rev = typing ? easeOut(seg(pWork, 0, 0.15)) : 1, shown = sig.slice(0, Math.ceil(sig.length * rev))
    const sp = on && running ? seg(pWork, 0.15, 0.72) : 0, sel = on && running ? easeOut(seg(pWork, 0.72, 0.82)) : 0, info = on && running ? easeOut(seg(pWork, 0.8, 0.95)) : 0
    let pos = 0; if (sp > 0) { if (sp < 0.62) pos = (target + 0.7) * Math.pow(sp / 0.62, 2.2); else { const u = (sp - 0.62) / 0.38; pos = target + 0.7 * Math.exp(-5.5 * u) * Math.cos(11 * u) } }
    return <g>
      <clipPath id="txclip"><rect x={X} y={y + 62} width={W} height={50} /></clipPath>
      <rect x={X} y={y + 34} width={W} height={18} rx={2} fill={ACC} fillOpacity={0.04 + (typing ? 0.12 * rev : 0)} stroke={ACC} strokeOpacity={typing ? 0.7 : 0.18} />
      <T x={X + 8} y={y + 46.5} size={9.5} mono fill={sig ? INK : MUTE}>{sig ? short(shown.length >= sig.length ? sig : shown) : 'paste a signature'}</T>
      {typing && rev < 1 && <rect x={X + 8 + Math.min(shown.length, 14) * 5.7} y={y + 38} width={1.2} height={10} fill={ACC} />}
      <g clipPath="url(#txclip)">
        {Array.from({ length: NT }, (_, k) => {
          const tx = X + (k - pos + 2) * TW, cxm = tx + (TW - 4) / 2, edge = Math.max(0, Math.abs(cxm - (X + W / 2)) - W * 0.36) / (W * 0.14), op = Math.max(0, 1 - edge)
          const passed = sp > 0 && k < pos - 0.6, under = sp > 0 && sp < 1 && Math.abs(k - pos) < 0.5, hit = k === target && sel > 0.05
          return <g key={k} opacity={op}><rect x={tx} y={y + 68} width={TW - 4} height={38} rx={2} fill={hit ? ACC : 'white'} fillOpacity={hit ? 0.1 + 0.6 * sel : under ? 0.14 : passed ? 0.02 : 0.06} stroke={hit ? ACC : EDGE} />
            {passed && !hit && <path d={`M${tx + 8} ${y + 94} l3 3 l6 -6`} fill="none" stroke="white" strokeOpacity={0.28} strokeWidth={1.2} strokeLinecap="round" />}
            <T x={tx + (TW - 4) / 2} y={y + 91} size={9} mono anchor="middle" fill={hit && sel > 0.3 ? INK : MUTE}>{hit && sel > 0.3 && rs ? String(rs).slice(-3) : passed ? '' : '···'}</T></g>
        })}
      </g>
      {sp > 0 && sel < 1 && <g><rect x={X + 2 * TW - 2} y={y + 65} width={TW} height={44} rx={2} fill="none" stroke={ACC} strokeWidth={1.3} /><path d={`M${X + 2 * TW + TW / 2 - 2} ${y + 62} l-3.5 -5 h7 z`} fill={ACC} /></g>}
      <T x={X} y={y + 132} size={9} mono fill={INK} op={on && have && info > 0 ? (rs ? info : 0) : 0}>{rs ? `slot ${fmt(rs)}` : ''}</T>
      <T x={X + W} y={y + 132} size={9} mono anchor="end" fill={INK} op={on && have && info > 0 ? info : 0}>{res == null ? 'not found' : `fee ${fmt(fee ?? 0)}`}</T>
    </g>
  }
  if (m === 'addr') {
    /* every signature that touched this address, each pointing at its slot: five rows, the five we ask for */
    const scan = on && running ? seg(pWork, 0.15, 0.85) : 0, slots: number[] = on && resp && Array.isArray((resp.json as J)?.result) ? (resp.json as J).result.map((e: { slot: number }) => e.slot) : [], cnt = slots.length
    return <g>
      <T x={X + W - 22} y={y + 22} size={9.5} mono anchor="end" fill={INK} op={on && resp && scan > 0.9 ? 1 : 0}>{`${cnt} sigs`}</T>
      {Array.from({ length: 5 }, (_, i) => { const ry = y + 36 + i * 20, hot = scan * 5.6 > i + 0.2, cur = Math.floor(scan * 5.6) === i
        return <g key={i}><rect x={X} y={ry} width={W} height={16} rx={2} fill={cur && on ? ACC : 'white'} fillOpacity={cur && on ? 0.16 : hot && on ? 0.07 : 0.04} /><rect x={X + 8} y={ry + 6} width={60 + ((i * 31) % 40)} height={4} rx={1} fill={hot && on ? ACC : 'white'} fillOpacity={hot && on ? 0.7 : 0.12} />
          <T x={X + W - 8} y={ry + 11.5} size={9.5} mono anchor="end" fill={hot && on && slots[i] ? INK : MUTE}>{hot && on && slots[i] ? `slot ${String(slots[i]).slice(-3)}` : 'slot ···'}</T></g> })}
    </g>
  }
  return null
}

/* ------------------------------------------------------------------ edit mode: drag to move, pull the corner to resize */
function EditLayer({ L, set, k }: { L: Layout; set: (f: (o: Layout) => Layout) => void; k: number }) {
  type Mode = 'move' | 'size'
  const drag = useRef<{ it: Item; mode: Mode; cx: number; cy: number; p: Place } | null>(null)
  const down = (e: React.PointerEvent, it: Item, mode: Mode) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = { it, mode, cx: e.clientX, cy: e.clientY, p: L[it] ?? { dx: 0, dy: 0, s: 1 } } }
  const baseW = (it: Item) => NAT[it].w
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return; const dx = (e.clientX - d.cx) / k, dy = (e.clientY - d.cy) / k, sn = (v: number) => Math.round(v / 2) * 2, p = d.p, sc = p.s
    set(o => ({ ...o, [d.it]:
      d.mode === 'move' ? { ...p, dx: sn(p.dx + dx), dy: sn(p.dy + dy) }
      : d.mode === 'size' ? { ...p, s: Math.round(Math.max(0.4, Math.min(2.6, sc + dx / baseW(d.it))) * 100) / 100 }
      : { ...p, s: p.s } }))
  }
  const up = () => { drag.current = null }
  const hs = 12 / k, handle = (key: string, x: number, y: number, it: Item, mode: Mode, cursor: string, round = 3, shape: 'sq' | 'dia' = 'sq') =>
    <rect key={key} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} rx={round / k} fill={'#5b9bff'} stroke="#0b0b0b" strokeWidth={1.5 / k} transform={shape === 'dia' ? `rotate(45 ${x} ${y})` : undefined} pointerEvents="all" style={{ cursor, touchAction: 'none' }} onPointerDown={e => down(e, it, mode)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
  return <g>{ITEMS.map(it => { const b = eff(it, L), p = L[it] ?? { dx: 0, dy: 0, s: 1 }
    return <g key={it}>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill="rgba(91,155,255,.05)" stroke="#5b9bff" strokeOpacity={0.85} strokeDasharray={`${5 / k} ${4 / k}`} strokeWidth={1.4 / k} pointerEvents="all" style={{ cursor: 'move', touchAction: 'none' }} onPointerDown={e => down(e, it, 'move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <text x={b.x + 6 / k} y={b.y - 5 / k} fontSize={10 / k} fill="#8db6ff" fontFamily="'IBM Plex Mono', monospace" pointerEvents="none">{it}</text>
      {handle('c', b.x + b.w, b.y + b.h, it, 'size', 'nwse-resize')}
    </g> })}</g>
}

/* ------------------------------------------------------------------ the component */
type Geom = { w: number; h: number; ox: number; oy: number; s: number; ao: Pt; ai: Pt; clip: Box4 }
export function Journey({ method, vals, net, runId, resp, err, slotAnchor, slotMs, bodyRef, lboxRef, runRef, termRef, onArrived }: { method: string; vals: Record<string, string>; net: string; runId: number; resp: Resp; err: string; slotAnchor: { slot: number; at: number } | null; slotMs: number; bodyRef: React.RefObject<HTMLDivElement>; lboxRef: React.RefObject<HTMLDivElement>; runRef: React.RefObject<HTMLButtonElement>; termRef: React.RefObject<HTMLDivElement>; onArrived: (a: boolean) => void }) {
  const [t, setT] = useState(0), [now, setNow] = useState(() => performance.now()), [playing, setPlaying] = useState(true), [speed, setSpeed] = useState(1), [started, setStarted] = useState(false)
  const reduce = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const st = useRef({ t: 0, playing: true, speed: 1, resp: resp as Resp, err, started: false, kind: 'pending' as string })
  const kind = kindOf(resp, err)
  st.current.playing = playing; st.current.speed = speed; st.current.resp = resp; st.current.err = err; st.current.kind = kind
  const run0 = useRef(runId), runVals = useRef(vals), [held, setHeld] = useState(vals) // the boxes keep showing the last address until a run actually reaches them
  useEffect(() => { if (runId !== run0.current) runVals.current = vals }, [runId])
  useEffect(() => { if (started && t >= P.work[0] && held !== runVals.current) setHeld(runVals.current) }, [t, started])
  useEffect(() => { if (runId !== run0.current) { st.current.t = 0; st.current.started = true; setStarted(true); setT(0); setPlaying(true) } }, [runId])
  useEffect(() => {
    let raf = 0, last = performance.now()
    const loop = (n: number) => {
      const dt = Math.min(64, n - last); last = n; const s = st.current
      if (!reduce) setNow(n)
      if (s.started && s.playing) {
        const resolved = !!s.resp || !!s.err, k = s.kind
        let nt = s.t + dt * s.speed
        if (reduce && resolved) nt = TOTAL
        if (!resolved && nt > HOLD) nt = HOLD
        if (resolved && (k === 'gateway' || k === 'network') && nt > P.gate[1] && nt < P.ret[0]) nt = P.ret[0]
        if (nt > TOTAL) nt = TOTAL
        if (nt !== s.t) { s.t = nt; setT(nt) }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf)
  }, [reduce])
  const raw = slotAnchor ? (now - slotAnchor.at) / slotMs : now / slotMs, slot = slotAnchor ? slotAnchor.slot + Math.floor(raw) : null, sf = raw - Math.floor(raw)
  const steps = stepsFor(method, resp, kind, net), idle = !started
  const activeIdx = idle ? -1 : steps.reduce((a, s, i) => (t >= s.at ? i : a), 0)
  const done = t >= TOTAL
  const replay = useCallback(() => { st.current.t = 0; st.current.started = true; setStarted(true); setT(0); setPlaying(true) }, [])
  const arrived = !idle && (!!resp || !!err) && t >= P.ret[1]
  useEffect(() => { onArrived(arrived) }, [arrived])
  /* geometry: the scene is drawn in one overlay that spans both boxes, so lines can start and end on the real DOM */
  const rbox = useRef<HTMLDivElement>(null), [g, setG] = useState<Geom | null>(null), [tip, setTip] = useState<{ m: Mod; x: number; y: number } | null>(null)
  const onTip = useCallback((m: Mod | null, el: Element | null) => { const b = bodyRef.current; if (!m || !el || !b) { setTip(null); return } const r = el.getBoundingClientRect(), B = b.getBoundingClientRect(); setTip({ m, x: Math.max(8, Math.min(B.width - 308, r.right - B.left - 300)), y: r.bottom - B.top + 8 }) }, [])
  const [L, setL] = useState<Layout>(loadLayout), [edit, setEdit] = useState(false), [copied, setCopied] = useState(false)
  const out = useMemo(() => ({ note: 'x,y,w,h are in scene units; scale is relative to the original size', items: Object.fromEntries(ITEMS.map(it => [it, { ...eff(it, L), scale: L[it]?.s ?? 1 }])) }), [L])
  const save = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(L)) } catch { /* private mode */ } fetch('/__layout', { method: 'POST', body: JSON.stringify(out) }).catch(() => {}); setEdit(false) }
  useEffect(() => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(L)) } catch { /* private mode */ } const id = setTimeout(() => { fetch('/__layout', { method: 'POST', body: JSON.stringify(out) }).catch(() => {}) }, 300); return () => clearTimeout(id) }, [L])
  useEffect(() => {
    const measure = () => {
      const body = bodyRef.current, rb = rbox.current, lb = lboxRef.current, run = runRef.current, tm = termRef.current
      if (!body || !rb || !lb || !run || !tm) return
      const B = body.getBoundingClientRect(), R = rb.getBoundingClientRect(), L = lb.getBoundingClientRect(), Rn = run.getBoundingClientRect(), Tm = tm.getBoundingClientRect()
      const ax = R.left - B.left + 20, ay = R.top - B.top + 44, aw = R.width - 40, ah = R.height - 44 - 16
      const s = Math.max(0.4, Math.min(aw / BND.w, ah / BND.h, 1.6)), ox = ax + (aw - BND.w * s) / 2 - BND.x * s, oy = ay + (ah - BND.h * s) / 2 - BND.y * s
      const to = (px: number, py: number): Pt => pt((px - ox) / s, (py - oy) / s)
      const stacked = L.right > R.left - 8 // narrow screens stack the two boxes, so the lines start at the canvas edge
      const cx0 = stacked ? R.left : L.right
      const next: Geom = { w: B.width, h: B.height, ox, oy, s, clip: { x: cx0 - B.left, y: R.top - B.top, w: R.right - cx0, h: R.height }, ao: stacked ? to(R.left - B.left, R.top - B.top + 60) : to(L.right - B.left, Rn.top + Rn.height / 2 - B.top), ai: stacked ? to(R.left - B.left, R.top - B.top + 110) : to(L.right - B.left, Tm.top + Math.min(Tm.height / 2, 120) - B.top) }
      setG(o => (o && Math.abs(o.w - next.w) < .5 && Math.abs(o.h - next.h) < .5 && Math.abs(o.s - next.s) < .001 && Math.abs(o.ao.y - next.ao.y) < .3 && Math.abs(o.ai.y - next.ai.y) < .3 && Math.abs(o.ao.x - next.ao.x) < .3 ? o : next))
    }
    measure(); const ro = new ResizeObserver(measure); [bodyRef.current, rbox.current, lboxRef.current, runRef.current, termRef.current].forEach(e => e && ro.observe(e))
    addEventListener('resize', measure); const id = setInterval(measure, 400)
    return () => { ro.disconnect(); removeEventListener('resize', measure); clearInterval(id) }
  }, [method])
  return (
    <>
      <div className="rbox" ref={rbox}>
        <div className="rtop"><span className="rhint"></span>
          <div className="rtools">
            {edit && <><button className="chip" onClick={() => setL(DEFAULT_L)}><RotateCcw size={13} />Reset</button></>}
            {edit ? <button className="chip save" onClick={save}><Check size={13} />Save</button> : <button className="iconbtn edit" aria-label="Edit layout" onClick={() => setEdit(true)}><Move size={16} /></button>}
          <div className="rinfo"><button className="iconbtn" aria-label="How this request travels"><Info size={16} /></button>
            <div className="rtip" role="tooltip"><p className="rtip-h">How {method} travels</p>
              <ol className="j-steps" aria-live="polite">{steps.map((s, i) => <li key={i} className={i === activeIdx ? 'on' : i < activeIdx || (done && !idle) ? 'past' : 'idle'}><span className="n">{i + 1}</span><div><p>{s.text}</p><em className={`tag ${s.tag}`}>{s.tag === 'measured' ? 'measured' : s.tag === 'illustrative' ? 'illustrative' : s.tag === 'documented' ? 'from Helius docs' : 'Solana protocol'}</em></div></li>)}
                {resp && !idle && t >= P.ret[0] + 300 && <li className="rt"><span className="n">⏱</span><div><p><b>{resp.ms} ms</b> round trip from your browser</p><em className="tag measured">measured</em></div></li>}</ol>
              <div className="j-legend"><span><i className="sw m" />measured from your real call</span><span><i className="sw i" />illustrative: step positions and timings</span></div></div></div></div></div>
      </div>
      {g && <svg className="overlay" width={g.w} height={g.h} role="img" aria-label={`Animated journey of a ${method} request from the playground through Helius to an RPC node and back`}>
        <defs><clipPath id="sceneclip"><rect x={g.clip.x} y={g.clip.y} width={g.clip.w} height={g.clip.h} rx={12} /></clipPath></defs>
        <g clipPath="url(#sceneclip)"><g transform={`translate(${g.ox} ${g.oy}) scale(${g.s})`}><Scene method={method} vals={held} t={idle ? 0 : t} now={now} slot={slot} sf={sf} resp={resp} kind={kind} playing={playing} idle={idle} aOut={g.ao} aIn={g.ai} L={L} slotMs={slotMs} reduce={reduce} onTip={onTip} /></g>{edit && <g transform={`translate(${g.ox} ${g.oy}) scale(${g.s})`}><EditLayer L={L} set={setL} k={g.s} /></g>}</g>
      </svg>}
      {tip && <div className="mtip" role="tooltip" style={{ left: tip.x, top: tip.y }}><p className="mtip-h">{TIPS[tip.m].title}</p><p>{TIPS[tip.m].body}</p></div>}
    </>
  )
}
