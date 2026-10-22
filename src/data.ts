// All mock data lives here. Swap for a real API later.
export type Market = { sym: string; lev: number; vol: string; price: number; change: number; color: string; glyph: string; decimals: number }

export const markets: Market[] = [
  { sym: 'BTC', lev: 75, vol: '$65.95M', price: 82211.1, change: 0.26, color: '#f7931a', glyph: '₿', decimals: 1 },
  { sym: 'ETH', lev: 50, vol: '$15.26M', price: 2417.59, change: 0.1, color: '#627eea', glyph: 'Ξ', decimals: 2 },
  { sym: 'SOL', lev: 50, vol: '$7.95M', price: 104.61, change: 0.64, color: '#14f195', glyph: '≡', decimals: 2 },
  { sym: 'NEAR', lev: 20, vol: '$3.02M', price: 4.9685, change: 0.29, color: '#00ec97', glyph: 'N', decimals: 4 },
  { sym: 'ZEC', lev: 15, vol: '$2.56M', price: 1136.12, change: 0.63, color: '#f4b728', glyph: 'Z', decimals: 2 },
  { sym: 'HYPE', lev: 20, vol: '$1.67M', price: 79.218, change: 0.27, color: '#50d2c1', glyph: 'H', decimals: 3 },
  { sym: 'MU', lev: 10, vol: '$1.01M', price: 908.04, change: 4.18, color: '#8b5cf6', glyph: 'm', decimals: 2 },
  { sym: 'SUI', lev: 20, vol: '$500.31K', price: 0.9964, change: 1.32, color: '#4da2ff', glyph: 'S', decimals: 4 },
  { sym: 'PUMP', lev: 5, vol: '$399.61K', price: 0.0044115, change: 3.52, color: '#22c55e', glyph: 'P', decimals: 7 },
  { sym: 'UNI', lev: 10, vol: '$362.62K', price: 7.3738, change: 1.51, color: '#ff007a', glyph: 'U', decimals: 4 },
  { sym: 'BNB', lev: 40, vol: '$362.06K', price: 724.94, change: 0.33, color: '#f3ba2f', glyph: 'B', decimals: 2 },
  { sym: 'ADA', lev: 15, vol: '$336.72K', price: 0.21825, change: -0.84, color: '#3468d1', glyph: 'A', decimals: 5 },
  { sym: 'MET', lev: 5, vol: '$321.89K', price: 0.33555, change: -0.49, color: '#e5484d', glyph: 'M', decimals: 5 },
]

export const fmtPrice = (n: number, d: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export const indices = [
  { name: 'S&P 500', price: 767.07, change: 0.49 },
  { name: 'Nasdaq 100', price: 717.64, change: 1.1 },
  { name: 'Semiconductors', price: 553.83, change: 2.65 },
]

export const gainers = [
  { sym: 'CLF', change: 12.21, color: '#2f6fb5' }, { sym: 'DGXX', change: 7.63, color: '#f5c518' },
  { sym: 'RCAT', change: 6.9, color: '#e5484d' }, { sym: 'MXL', change: 4.94, color: '#e6e6e6' },
  { sym: 'CIFR', change: 4.92, color: '#f5c518' }, { sym: 'ACMR', change: 4.1, color: '#1a8fd9' },
]
export const losers = [
  { sym: 'PTN', change: -7.24, color: '#7c5cd6' }, { sym: 'ABVX', change: -5.27, color: '#3cc4a0' },
  { sym: 'BNKK', change: -4.8, color: '#f59e0b' }, { sym: 'LQDA', change: -1.98, color: '#3b6fd4' },
  { sym: 'LNG', change: -1.88, color: '#b8c4d6' }, { sym: 'BCS', change: -1.6, color: '#1ea0e0' },
]

export const portfolio = {
  total: 3.07, delta: 0.00002, deltaPct: 0, mmr: 0, netEquity: 3.06, openPnl: 0, apy: 3.74,
  assets: [{ sym: 'US Dollar', token: 'USD', amount: '3.0554323 USD', value: 3.06, apy: 3.74 }],
  dust: 0.01,
}

// deterministic pseudo-random so the demo looks the same on every load
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) }

export function series(seed: number, n: number, start: number, vol: number) {
  const r = rng(seed); const out = [start]
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + (r() - 0.48) * vol))
  return out
}

export type Candle = { o: number; h: number; l: number; c: number; v: number }
export function candles(seed: number, n: number, start: number): Candle[] {
  const r = rng(seed); let p = start; const out: Candle[] = []
  for (let i = 0; i < n; i++) {
    const o = p; const c = o * (1 + (r() - 0.47) * 0.04)
    out.push({ o, c, h: Math.max(o, c) * (1 + r() * 0.015), l: Math.min(o, c) * (1 - r() * 0.015), v: r() })
    p = c
  }
  return out
}

export type Level = { price: number; qty: number }
export function book(mid: number, step: number, seed: number) {
  const r = rng(seed)
  const asks: Level[] = Array.from({ length: 6 }, (_, i) => ({ price: mid + step * (6 - i), qty: Math.round(r() * r() * 1000) + 1 }))
  const bids: Level[] = Array.from({ length: 6 }, (_, i) => ({ price: mid - step * (i + 1), qty: Math.round(r() * r() * 1000) + 1 }))
  return { asks, bids }
}

// ---- markets the trade screen can open ----
export type Pair = { sym: string; name: string; maxLev: number; price: number; dec: number; change: number; vol: string; spotOnly: boolean }
export const pairs: Pair[] = [
  ...markets.map(m => ({ sym: m.sym, name: m.sym, maxLev: m.lev, price: m.price, dec: m.decimals, change: m.change, vol: m.vol, spotOnly: false })),
  { sym: 'BP', name: 'BP', maxLev: 0, price: 1.07705, dec: 5, change: -0.12, vol: '$985.69K', spotOnly: true },
]
export const pairOf = (sym: string) => pairs.find(p => p.sym === sym) ?? pairs.find(p => p.sym === 'PUMP')!
export const pairLabel = (p: Pair, fut: boolean) => (fut ? `${p.sym}-PERP` : `${p.sym}/USD`)

// token amounts: whole numbers when large, more decimals as they get small
export const fmtQty = (q: number) =>
  Math.abs(q) >= 100 ? q.toLocaleString('en-US', { maximumFractionDigits: 0 })
  : Math.abs(q) >= 1 ? q.toLocaleString('en-US', { maximumFractionDigits: 2 })
  : Number(q.toPrecision(3)).toString()
