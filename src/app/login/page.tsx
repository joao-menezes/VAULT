'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './auth.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!email || !password) { setError('Preencha todos os campos.'); return }
    if (mode === 'register' && password.length < 6) { setError('Senha mínima: 6 caracteres.'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erro.'); return }
      router.push('/dashboard')
    } catch {
      setError('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.bg}>
      <div className={styles.grid} />
      <div className={styles.center}>
        <div className={styles.logo}>
          <div className={styles.symbol}>🔐</div>
          <h1 className={styles.title}>VAULT</h1>
          <p className={styles.sub}>GERENCIADOR DE SENHAS SEGURO</p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTop} />
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`} onClick={() => { setMode('login'); setError('') }}>ENTRAR</button>
            <button className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`} onClick={() => { setMode('register'); setError('') }}>CRIAR CONTA</button>
          </div>
          <div className={styles.body}>
            <label className={styles.label}>E-MAIL</label>
            <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            <label className={styles.label}>SENHA {mode === 'register' ? '(mín. 6 caracteres)' : ''}</label>
            <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            {mode === 'register' && (
              <p className={styles.hint}>Esta é a sua senha de <strong>acesso à conta</strong>. A senha mestre (para descriptografar) será definida na próxima tela.</p>
            )}
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} onClick={handleSubmit} disabled={loading}>
              {loading ? 'AGUARDE...' : mode === 'login' ? 'DESBLOQUEAR' : 'CRIAR CONTA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
