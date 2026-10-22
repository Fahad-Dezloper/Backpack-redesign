// Server-side proxy for the Helius playground. The API key lives in the HELIUS_API_KEY environment variable and never reaches the browser.
const HOSTS = { mainnet: 'https://mainnet.helius-rpc.com', devnet: 'https://devnet.helius-rpc.com' }
const ALLOWED = new Set(['getSlot', 'getAccountInfo', 'getLatestBlockhash', 'getTransaction', 'getSignaturesForAddress'])
const hits = new Map() // best-effort per-IP limit; it resets whenever the function instance does

const fail = (res, status, message, code = -32000) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code, message } }))
}
const readBody = req => new Promise((resolve, reject) => {
  let s = ''
  req.on('data', c => { s += c; if (s.length > 20000) { reject(new Error('too large')); req.destroy() } })
  req.on('end', () => resolve(s))
  req.on('error', reject)
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Use POST.')
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim(), now = Date.now()
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000)
  if (recent.length >= 40) return fail(res, 429, 'Too many requests. Wait a minute and try again.', -32005)
  hits.set(ip, [...recent, now])
  let input = req.body
  try { if (input === undefined) input = await readBody(req); if (typeof input === 'string') input = JSON.parse(input) } catch { return fail(res, 400, 'Bad request.') }
  const { net, method, params } = input || {}
  if (!HOSTS[net]) return fail(res, 400, 'Unknown network.')
  if (!ALLOWED.has(method)) return fail(res, 400, 'This method is not available in the playground.')
  if (!Array.isArray(params) || params.length > 3) return fail(res, 400, 'Bad parameters.')
  const key = process.env.HELIUS_API_KEY
  if (!key) return fail(res, 503, 'The playground has no API key configured yet.')
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const up = await fetch(`${HOSTS[net]}/?api-key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctl.signal })
    const text = await up.text()
    res.statusCode = up.status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(text)
  } catch { fail(res, 504, 'Helius did not answer in time.') }
  finally { clearTimeout(timer) }
}
