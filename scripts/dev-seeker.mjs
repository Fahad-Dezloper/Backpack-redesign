#!/usr/bin/env node
// `npm run dev`: start Vite and open the app on a USB-connected Android phone (the Seeker).
//   adb reverse  -> phone's localhost:PORT tunnels to this Mac, so no Wi-Fi/IP setup and HMR works.
//   Re-opens automatically if the phone is unplugged and replugged.
// Env: ANDROID_SERIAL=<serial> to pick a device, PORT=<n> to change the port, BROWSER_PKG=<pkg> (default Chrome).
import { spawn, execFileSync } from 'node:child_process'

const PORT = Number(process.env.PORT || 5173)
const URL_ = `http://localhost:${PORT}/`
const PKG = process.env.BROWSER_PKG || 'com.android.chrome'
const openOnly = process.argv.includes('--open-only')

const adb = (args, serial) => execFileSync('adb', serial ? ['-s', serial, ...args] : args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

function devices() {
  try {
    return adb(['devices']).split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(([s, st]) => s && st === 'device').map(([s]) => s)
  } catch { return null } // null = adb missing
}

function pick(list) {
  const want = process.env.ANDROID_SERIAL
  if (want) return list.includes(want) ? want : null
  return list[0] ?? null // Seeker first if several are attached
}

let opened = null // serial we've already launched on
function launch(serial) {
  adb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`], serial)
  try { adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], serial) } catch {}
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', URL_, '-p', PKG], serial)
  opened = serial
  console.log(`\n\x1b[32m✓ opened on device ${serial}\x1b[0m  (${URL_} via adb reverse)\n`)
}

let warned = false
function tick() {
  const list = devices()
  if (list === null) { if (!warned) console.log('\x1b[33m! adb not found - install Android platform-tools. Dev server still runs at ' + URL_ + '\x1b[0m'); warned = true; return }
  const serial = pick(list)
  if (!serial) {
    if (opened) { console.log('\x1b[33m! device disconnected, waiting for it...\x1b[0m'); opened = null }
    else if (!warned) { console.log('\x1b[33m! no Android device found. Plug in the Seeker (USB debugging on, tap Allow). Waiting...\x1b[0m'); warned = true }
    return
  }
  if (opened !== serial) { try { launch(serial); warned = false } catch (e) { console.log('\x1b[31m! could not open on device:\x1b[0m', String(e.stderr || e.message).trim()) } }
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(URL_); if (r.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 200))
  }
  return false
}

if (openOnly) { tick(); process.exit(0) }

const vite = spawn('npx', ['vite', '--host', '--port', String(PORT), '--strictPort'], { stdio: 'inherit', shell: process.platform === 'win32' })
vite.on('exit', code => process.exit(code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { adb(['reverse', '--remove', `tcp:${PORT}`]) } catch {} vite.kill(sig); process.exit(0) })

if (await waitForServer()) { tick(); setInterval(tick, 3000) }
