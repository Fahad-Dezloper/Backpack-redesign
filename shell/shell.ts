import './shell.css'

type App = 'backpack' | 'helius'
const WHAT: Record<App, string> = { backpack: 'Best experienced on your phone: open this link on mobile', helius: 'RPC playground' }
const $ = <T extends Element>(q: string) => document.querySelector(q) as T
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.switch button')]
const pill = $<HTMLElement>('.pill'), what = $<HTMLElement>('#what'), fit = $<HTMLElement>('#fit')
const panes: Record<App, HTMLElement> = { backpack: $('#p-backpack'), helius: $('#p-helius') }
const slots: Record<App, HTMLElement> = { backpack: $('#f-backpack'), helius: $('#f-helius') }
const loaded: Partial<Record<App, boolean>> = {}
const phoneMq = matchMedia('(max-width: 500px)')
let current: App = location.hash === '#helius' && !phoneMq.matches ? 'helius' : 'backpack' // phones only get Backpack
let swap = 0

const src = (a: App) => a === 'helius' ? '/helius.html' : (phoneMq.matches ? '/backpack.html?clean=1' : '/backpack.html?bare&ios&clean=1')

function movePill() {
  const t = tabs.find(b => b.dataset.app === current)!
  pill.style.width = t.offsetWidth + 'px'
  pill.style.transform = `translateX(${t.offsetLeft - 4}px)`
}
function fitPhone() {
  document.body.classList.toggle('phone', phoneMq.matches)
  if (phoneMq.matches) { fit.style.removeProperty('--s'); return }
  const stage = $<HTMLElement>('#stage'), s = Math.min(1, (stage.clientHeight - 28) / 914, (stage.clientWidth - 32) / 424)
  fit.style.setProperty('--s', String(Math.max(0.4, s)))
}
function ensureFrame(a: App): Promise<void> {
  if (loaded[a]) return Promise.resolve()
  return new Promise(res => {
    const f = document.createElement('iframe')
    f.title = a === 'helius' ? 'Helius RPC playground redesign' : 'Backpack redesign'
    f.setAttribute('allow', 'clipboard-write')
    f.addEventListener('load', () => { loaded[a] = true; setTimeout(res, 120) }, { once: true })
    f.src = src(a)
    slots[a].appendChild(f)
  })
}
function reveal(a: App) {
  const p = panes[a]
  p.hidden = false
  p.classList.remove('show', 'in'); void p.offsetWidth
  p.classList.add('on', 'in', 'show')
}
function hide(a: App) {
  const p = panes[a]
  p.classList.remove('on', 'in', 'show')
  setTimeout(() => { if (!p.classList.contains('on')) p.hidden = true }, 260)
}
async function show(a: App, first = false) {
  const id = ++swap
  const prev = current
  current = a
  tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.app === a)))
  movePill()
  what.style.opacity = '0'; setTimeout(() => { what.textContent = WHAT[a]; what.style.opacity = '1' }, 160)
  history.replaceState(null, '', a === 'helius' ? '#helius' : location.pathname)
  if (!first && prev !== a) hide(prev)
  await ensureFrame(a)
  if (id !== swap) return // the user switched again while this one was loading
  reveal(a)
}
tabs.forEach(b => b.addEventListener('click', () => { if (b.dataset.app !== current) show(b.dataset.app as App) }))
addEventListener('resize', () => { fitPhone(); movePill() })
phoneMq.addEventListener('change', () => { // the layout flipped between desktop and phone: reload the Backpack frame so it matches
  fitPhone()
  if (phoneMq.matches && current !== 'backpack') show('backpack')
  if (loaded.backpack) { const f = slots.backpack.querySelector('iframe'); if (f) f.src = src('backpack') }
})
fitPhone()
what.textContent = WHAT[current]
document.fonts?.ready.then(movePill)
movePill()
show(current, true)
