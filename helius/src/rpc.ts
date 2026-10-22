// The playground's method list (copied from the live Helius playground), parameters, code samples and the real RPC call.
export const METHODS = ['getAccountInfo', 'getAsset', 'getAssetProof', 'getAssetsByGroup', 'getAssetsByCreator', 'getAssetsByOwner', 'getAssetsByAuthority', 'getSignaturesForAsset', 'getBalance', 'getBlockHeight', 'getBlockProduction', 'getBlockCommitment', 'getBlocks', 'getBlockTime', 'getClusterNodes', 'getEpochInfo', 'getEpochSchedule', 'getFeeForMessage', 'getFirstAvailableBlock', 'getGenesisHash', 'getHealth', 'getHighestSnapshotSlot', 'getIdentity', 'getInflationGovernor', 'getInflationRate', 'getLargestAccounts', 'getLatestBlockhash', 'getLeaderSchedule', 'getMaxRetransmitSlot', 'getMaxShredInsertSlot', 'getMinimumBalanceForRentExemption', 'getProgramAccounts', 'getRecentPerformanceSamples', 'getSignaturesForAddress', 'getSlot', 'getSlotLeader', 'getStakeMinimumDelegation', 'getSupply', 'getTokenAccountBalance', 'getTokenLargestAccounts', 'getTokenSupply', 'getTransaction', 'getTransactionCount', 'getVersion', 'getVoteAccounts', 'isBlockhashValid', 'minimumLedgerSlot']
export const EXAMPLE_ADDRESS = '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY'
export type Field = { key: string; label: string; placeholder?: string; def: string }
const ADDR: Field = { key: 'address', label: 'Solana Address', def: EXAMPLE_ADDRESS }
export const FIELDS: Record<string, Field[]> = {
  getAccountInfo: [ADDR], getBalance: [ADDR], getSignaturesForAddress: [ADDR],
  getTransaction: [{ key: 'signature', label: 'Transaction signature', placeholder: 'Paste a transaction signature', def: '' }],
  getTokenAccountBalance: [{ key: 'account', label: 'Token account', placeholder: 'Paste a token account address', def: '' }],
  getTokenSupply: [{ key: 'mint', label: 'Token mint', def: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
  getMinimumBalanceForRentExemption: [{ key: 'size', label: 'Account data size (bytes)', def: '165' }],
  isBlockhashValid: [{ key: 'blockhash', label: 'Blockhash', placeholder: 'Paste a blockhash', def: '' }],
  getBlockTime: [{ key: 'slot', label: 'Slot', def: '' }],
  getFeeForMessage: [{ key: 'message', label: 'Message (base64)', placeholder: 'Paste a base64 transaction message', def: '' }]
}
export const paramsFor = (m: string, v: Record<string, string>): unknown[] => {
  const g = (k: string) => (v[k] ?? '').trim()
  switch (m) {
    case 'getAccountInfo': return [g('address'), { encoding: 'base64' }]
    case 'getBalance': return [g('address')]
    case 'getSignaturesForAddress': return [g('address'), { limit: 5 }]
    case 'getTransaction': return [g('signature'), { maxSupportedTransactionVersion: 0, encoding: 'json' }]
    case 'getTokenAccountBalance': return [g('account')]
    case 'getTokenSupply': return [g('mint')]
    case 'getMinimumBalanceForRentExemption': return [Number(g('size') || 0)]
    case 'isBlockhashValid': return [g('blockhash')]
    case 'getBlockTime': return [Number(g('slot') || 0)]
    case 'getFeeForMessage': return [g('message')]
    default: return []
  }
}
export const missing = (m: string, v: Record<string, string>) => (FIELDS[m] || []).filter(f => !f.placeholder ? false : !(v[f.key] ?? '').trim())
export const maskKey = (k: string) => k ? k.slice(0, 8) + '-****-****-****-************' : 'YOUR_API_KEY'
export type Net = 'mainnet' | 'devnet'
let NET: Net = 'mainnet'
export const setNet = (n: Net) => { NET = n }
export const endpoint = (k: string, reveal = false) => `https://${NET}.helius-rpc.com/?api-key=${reveal ? k : maskKey(k)}`
export const body = (m: string, v: Record<string, string>) => ({ jsonrpc: '2.0', id: 1, method: m, params: paramsFor(m, v) })
export const curl = (m: string, v: Record<string, string>, key: string, reveal = false) => `curl '${endpoint(key, reveal)}' \\\n  --request POST \\\n  --header 'accept: application/json' \\\n  --header 'content-type: application/json' \\\n  --data '${JSON.stringify(body(m, v))}'`
export const ts = (m: string, v: Record<string, string>, key: string, reveal = false) => `const response = await fetch('${endpoint(key, reveal)}', {\n  method: 'POST',\n  headers: { 'content-type': 'application/json' },\n  body: JSON.stringify(${JSON.stringify(body(m, v))}),\n})\n\nconst data = await response.json()\nconsole.log(data)`
let CR = 0
export const credits = () => CR // every call this page makes costs the user 1 credit
export async function run(m: string, v: Record<string, string>, _key?: string) {
  CR++
  const t0 = performance.now()
  let res: Response
  try { res = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ net: NET, ...body(m, v) }) }) }
  catch { throw new Error('Could not reach the server. Check your connection.') }
  const text = await res.text()
  let json: unknown; try { json = JSON.parse(text) } catch { json = { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'The server returned an unexpected answer.' } } }
  return { status: res.status, ms: Math.round(performance.now() - t0), json }
}

/* ---- sample helpers (user-initiated; each makes one real call with the user's own key) ---- */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function b58(s: string): Uint8Array { let n = 0n; for (const c of s) n = n * 58n + BigInt(B58.indexOf(c)); const out: number[] = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n } for (const c of s) { if (c === '1') out.unshift(0); else break } return Uint8Array.from(out) }
export async function recentSignature(key: string, address: string): Promise<string> {
  const r = await run('getSignaturesForAddress', { address }, key), a = (r.json as any)?.result
  if (!Array.isArray(a) || !a[0]?.signature) throw new Error('No recent signature found for that address.')
  return a[0].signature
}
export async function sampleMessage(key: string, address: string): Promise<string> {
  const r = await run('getLatestBlockhash', {}, key), bh = (r.json as any)?.result?.value?.blockhash
  if (!bh) throw new Error('Could not fetch a blockhash.')
  const payer = b58(address), system = new Uint8Array(32), hash = b58(bh)
  const bytes = [1, 0, 1, 2, ...payer, ...system, ...hash, 1, 1, 0, 0]
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
