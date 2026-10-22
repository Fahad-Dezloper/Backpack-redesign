import { Zap } from 'lucide-react'
export function Avatar() {
  return <span className="avatar">M<span className="avatar-badge"><Zap size={9} fill="currentColor" strokeWidth={0} /></span></span>
}
export function AccountHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="acct-header">
      <Avatar /><h1>Main</h1><div className="acct-actions">{children}</div>
    </header>
  )
}
