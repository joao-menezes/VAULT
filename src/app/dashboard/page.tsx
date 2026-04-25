'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────
interface Entry {
  id: string
  title: string
  username: string
  password: string
  url: string
  category: string
  notes: string
  createdAt: number
  updatedAt: number
}

// ─── Crypto helpers (AES-256-GCM, PBKDF2) ───────────────
function b64(arr: Uint8Array) { return btoa(String.fromCharCode(...arr)) }
function ub64(s: string) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)) }

async function deriveKey(password: string, salt: Uint8Array) {
  const enc = new TextEncoder()
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

async function encryptEntries(entries: Entry[], password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const enc = new TextEncoder()
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(entries)))
  return { encrypted_data: b64(new Uint8Array(ct)), salt: b64(salt), iv: b64(iv) }
}

async function decryptEntries(payload: { encrypted_data: string; salt: string; iv: string }, password: string): Promise<Entry[]> {
  const salt = ub64(payload.salt)
  const iv = ub64(payload.iv)
  const ct = ub64(payload.encrypted_data)
  const key = await deriveKey(password, salt)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return JSON.parse(new TextDecoder().decode(pt))
}

function getStrength(pw: string) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(s, 4)
}

function esc(s: string) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ─── Component ───────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const [phase, setPhase] = useState<'master' | 'app'>('master')
  const [masterPw, setMasterPw] = useState('')
  const [masterConfirm, setMasterConfirm] = useState('')
  const [isNewVault, setIsNewVault] = useState(false)
  const [masterError, setMasterError] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'none' | 'add' | 'view'>('none')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [showViewPw, setShowViewPw] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string>('')
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [masterKey, setMasterKey] = useState('')

  // form state
  const [fTitle, setFTitle] = useState('')
  const [fUser, setFUser] = useState('')
  const [fPassword, setFPassword] = useState('')
  const [fUrl, setFUrl] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [genLen, setGenLen] = useState(16)
  const [genUpper, setGenUpper] = useState(true)
  const [genLower, setGenLower] = useState(true)
  const [genNum, setGenNum] = useState(true)
  const [genSym, setGenSym] = useState(false)

  const showToast = useCallback((msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Check if vault exists on server
  useEffect(() => {
    fetch('/api/vault').then(r => r.json()).then(data => {
      setIsNewVault(!data)
    }).catch(() => setIsNewVault(true))
  }, [])

  async function handleMasterUnlock() {
    setMasterError('')
    if (!masterPw || masterPw.length < 4) { setMasterError('Mínimo 4 caracteres.'); return }

    if (isNewVault) {
      if (masterPw !== masterConfirm) { setMasterError('Senhas não coincidem.'); return }
      setMasterKey(masterPw)
      await syncSave([], masterPw)
      setPhase('app')
    } else {
      try {
        const res = await fetch('/api/vault')
        const payload = await res.json()
        const decrypted = await decryptEntries(payload, masterPw)
        setEntries(decrypted)
        setMasterKey(masterPw)
        setLastSync(new Date().toLocaleTimeString('pt-BR'))
        setPhase('app')
      } catch {
        setMasterError('Senha mestre incorreta.')
      }
    }
  }

  async function syncSave(data: Entry[], pw?: string) {
    setSyncing(true)
    try {
      const payload = await encryptEntries(data, pw || masterKey)
      await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      setLastSync(new Date().toLocaleTimeString('pt-BR'))
    } catch {
      showToast('Erro ao sincronizar.', 'danger')
    } finally {
      setSyncing(false)
    }
  }

  async function saveEntry() {
    if (!fTitle.trim()) { showToast('Título obrigatório.', 'danger'); return }
    if (!fPassword) { showToast('Senha obrigatória.', 'danger'); return }

    const entry: Entry = {
      id: editingId || crypto.randomUUID(),
      title: fTitle.trim(),
      username: fUser.trim(),
      password: fPassword,
      url: fUrl.trim(),
      category: fCategory.trim() || 'Geral',
      notes: fNotes.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    let updated: Entry[]
    if (editingId) {
      updated = entries.map(e => e.id === editingId ? entry : e)
    } else {
      updated = [...entries, entry]
    }

    setEntries(updated)
    await syncSave(updated)
    setModal('none')
    showToast(editingId ? 'Entrada atualizada!' : 'Senha salva!')
  }

  async function deleteEntry(id: string) {
    if (!confirm('Apagar esta entrada?')) return
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated)
    await syncSave(updated)
    showToast('Entrada removida.', 'warn')
  }

  function openAdd() {
    setEditingId(null)
    setFTitle(''); setFUser(''); setFPassword(''); setFUrl(''); setFCategory(''); setFNotes('')
    setShowPw(false)
    setModal('add')
  }

  function openEdit(id: string) {
    const e = entries.find(x => x.id === id)
    if (!e) return
    setEditingId(id)
    setFTitle(e.title); setFUser(e.username); setFPassword(e.password)
    setFUrl(e.url); setFCategory(e.category); setFNotes(e.notes)
    setShowPw(false)
    setModal('add')
  }

  function openView(id: string) {
    setViewId(id)
    setShowViewPw(false)
    setModal('view')
  }

  function generatePassword() {
    const upper = genUpper ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : ''
    const lower = genLower ? 'abcdefghijklmnopqrstuvwxyz' : ''
    const num = genNum ? '0123456789' : ''
    const sym = genSym ? '!@#$%^&*()-_=+[]{}|;:,.<>?' : ''
    const chars = upper + lower + num + sym
    if (!chars) { showToast('Selecione ao menos um tipo.', 'warn'); return }
    const arr = crypto.getRandomValues(new Uint32Array(genLen))
    const pw = Array.from(arr).map(x => chars[x % chars.length]).join('')
    setFPassword(pw)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // Derived state
  const categories = [...new Set(entries.map(e => e.category || 'Geral'))]
  const filtered = entries.filter(e => {
    const matchCat = activeCategory === 'ALL' || e.category === activeCategory
    const q = search.toLowerCase()
    const matchQ = !q || e.title.toLowerCase().includes(q) || e.username.toLowerCase().includes(q) || (e.url || '').toLowerCase().includes(q)
    return matchCat && matchQ
  })
  const viewEntry = entries.find(e => e.id === viewId)
  const strength = getStrength(fPassword)
  const strengthColors = ['', '#ff4560', '#ffa726', '#2196f3', '#00e5a0']
  const strengthLabels = ['', 'FRACA', 'MÉDIA', 'BOA', 'FORTE']
  const weakCount = entries.filter(e => getStrength(e.password) < 2).length

  // ─── MASTER PASSWORD SCREEN ───────────────────────────
  if (phase === 'master') return (
    <div style={S.bg}>
      <div style={S.gridBg} />
      <div style={S.center}>
        <div style={{ textAlign: 'center' }}>
          <div style={S.symbol}>🔐</div>
          <h1 style={S.logoTitle}>VAULT</h1>
          <p style={S.logoSub}>GERENCIADOR DE SENHAS SEGURO</p>
        </div>
        <div style={S.card}>
          <div style={S.cardBar} />
          <div style={{ padding: '28px' }}>
            <p style={S.lockLabel}>{isNewVault ? 'CRIAR SENHA MESTRE' : 'SENHA MESTRE'}</p>
            <input style={S.input} type="password" placeholder="••••••••••••" value={masterPw}
              onChange={e => setMasterPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMasterUnlock()} />
            {isNewVault && (
              <input style={{ ...S.input, marginTop: '12px' }} type="password" placeholder="CONFIRMAR SENHA"
                value={masterConfirm} onChange={e => setMasterConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMasterUnlock()} />
            )}
            <p style={S.hint}>
              {isNewVault
                ? 'Esta senha criptografa seus dados. Ela NUNCA é enviada ao servidor. Não a perca.'
                : 'Digite sua senha mestre para descriptografar o vault.'}
            </p>
            {masterError && <p style={S.error}>{masterError}</p>}
            <button style={S.btnPrimary} onClick={handleMasterUnlock}>
              {isNewVault ? 'CRIAR VAULT' : 'DESBLOQUEAR'}
            </button>
            <button style={S.btnLink} onClick={logout}>← Sair da conta</button>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── MAIN APP ─────────────────────────────────────────
  return (
    <div style={{ background: '#0a0b0d', minHeight: '100vh', color: '#e8eaf0', fontFamily: "'Syne', sans-serif", position: 'relative' }}>
      <div style={S.gridBg} />

      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '6px', color: '#00e5a0' }}>VAULT</span>
          <span style={S.statusBadge}>
            <span style={S.statusDot} />
            {syncing ? 'SINCRONIZANDO...' : lastSync ? `SYNC ${lastSync}` : 'CONECTADO'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={S.btnIcon} onClick={logout}>🔒 SAIR</button>
        </div>
      </header>

      {/* STATS */}
      <div style={S.statsBar}>
        {[['SENHAS', entries.length], ['CATEGORIAS', categories.length], ['FRACAS', weakCount]].map(([l, v]) => (
          <div key={l as string} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Share Tech Mono'", fontSize: '10px', color: '#5a6075', letterSpacing: '1px' }}>
            <span style={{ color: '#00e5a0', fontSize: '16px', fontWeight: 700, fontFamily: "'Syne'" }}>{v}</span> {l}
          </div>
        ))}
      </div>

      {/* LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 'calc(100vh - 113px)' }}>
        {/* SIDEBAR */}
        <aside style={S.sidebar}>
          <div style={{ padding: '20px' }}>
            <p style={S.sideLabel}>BUSCAR</p>
            <input style={{ ...S.input, padding: '9px 12px', fontSize: '12px' }} placeholder="filtrar..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <p style={S.sideLabel}>CATEGORIAS</p>
            {[['ALL', 'TODAS', entries.length], ...categories.map(c => [c, c.toUpperCase(), entries.filter(e => e.category === c).length])].map(([val, label, count]) => (
              <div key={val as string} style={{ ...S.catItem, ...(activeCategory === val ? S.catItemActive : {}) }}
                onClick={() => setActiveCategory(val as string)}>
                <span>{label}</span>
                <span style={S.catCount}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '0 20px' }}>
            <button style={S.btnAddSide} onClick={openAdd}>+ NOVA SENHA</button>
          </div>
        </aside>

        {/* CONTENT */}
        <main style={{ padding: '28px', overflowY: 'auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', letterSpacing: '3px', color: '#5a6075' }}>
              {activeCategory === 'ALL' ? 'TODAS AS SENHAS' : activeCategory.toUpperCase()}
            </span>
            <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: '#5a6075' }}>{filtered.length} entrada{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#5a6075' }}>
              <div style={{ fontSize: '48px', opacity: 0.3, marginBottom: '16px' }}>🔒</div>
              <p style={{ fontFamily: "'Share Tech Mono'", fontSize: '12px', letterSpacing: '2px', marginBottom: '24px' }}>NENHUMA ENTRADA</p>
              <button style={S.btnAddSide} onClick={openAdd}>+ NOVA SENHA</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '14px' }}>
              {filtered.map(e => (
                <div key={e.id} style={S.pwCard} onClick={() => openView(e.id)}>
                  <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '9px', letterSpacing: '2px', color: '#00e5a0', opacity: 0.7, marginBottom: '6px' }}>{e.category}</div>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                  <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '11px', color: '#5a6075', marginBottom: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.username || '—'}</div>
                  <div style={{ display: 'flex', gap: '8px' }} onClick={ev => ev.stopPropagation()}>
                    {[
                      ['📋 COPIAR', () => navigator.clipboard.writeText(e.password).then(() => showToast('Copiado!'))],
                      ['✏ EDITAR', () => openEdit(e.id)],
                      ['✕', () => deleteEntry(e.id), true]
                    ].map(([label, fn, danger]: any) => (
                      <button key={label as string} style={{ ...S.btnSm, ...(danger ? {} : {}) }} onClick={fn}>{label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ADD/EDIT MODAL */}
      {modal === 'add' && (
        <div style={S.backdrop} onClick={() => setModal('none')}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalBar} />
            <div style={S.modalHeader}>
              <span style={S.modalTitle}>{editingId ? 'EDITAR ENTRADA' : 'NOVA ENTRADA'}</span>
              <button style={S.modalClose} onClick={() => setModal('none')}>✕</button>
            </div>
            <div style={{ padding: '24px', maxHeight: '65vh', overflowY: 'auto' }}>
              {[
                ['TÍTULO / SERVIÇO', fTitle, setFTitle, 'text', 'Gmail, Netflix...'],
                ['USUÁRIO / E-MAIL', fUser, setFUser, 'text', 'usuario@email.com'],
              ].map(([label, val, set, type, ph]: any) => (
                <div key={label} style={{ marginBottom: '16px' }}>
                  <label style={S.fLabel}>{label}</label>
                  <input style={S.input} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
                </div>
              ))}

              {/* PASSWORD */}
              <div style={{ marginBottom: '16px' }}>
                <label style={S.fLabel}>SENHA</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input style={{ ...S.input, flex: 1 }} type={showPw ? 'text' : 'password'}
                    value={fPassword} onChange={e => setFPassword(e.target.value)} placeholder="••••••••" />
                  <button style={S.btnToggle} onClick={() => setShowPw(!showPw)}>{showPw ? '🙈' : '👁'}</button>
                </div>
                {/* strength */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ height: '3px', flex: 1, background: i <= strength ? strengthColors[strength] : '#2a2e3a', transition: 'background 0.3s' }} />
                    ))}
                  </div>
                  <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '9px', color: strength ? strengthColors[strength] : '#5a6075', letterSpacing: '2px', minWidth: '50px', textAlign: 'right' }}>
                    {fPassword ? strengthLabels[strength] : '—'}
                  </span>
                </div>
                {/* generator */}
                <div style={{ background: '#0a0b0d', border: '1px solid #2a2e3a', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: '#5a6075', letterSpacing: '2px' }}>GERADOR</span>
                    <button style={S.genBtn} onClick={generatePassword}>↺ GERAR</button>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' as const, marginBottom: '10px' }}>
                    {[['A-Z', genUpper, setGenUpper], ['a-z', genLower, setGenLower], ['0-9', genNum, setGenNum], ['!@#$', genSym, setGenSym]].map(([l, v, s]: any) => (
                      <label key={l} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: "'Share Tech Mono'", fontSize: '10px', color: '#5a6075', cursor: 'pointer' }}>
                        <input type="checkbox" checked={v} onChange={e => s(e.target.checked)} style={{ accentColor: '#00e5a0' }} /> {l}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '10px', color: '#5a6075', whiteSpace: 'nowrap' as const }}>COMP:</span>
                    <input type="range" min={8} max={64} value={genLen} onChange={e => setGenLen(Number(e.target.value))} style={{ flex: 1, accentColor: '#00e5a0' }} />
                    <span style={{ fontFamily: "'Share Tech Mono'", fontSize: '14px', color: '#00e5a0', minWidth: '28px' }}>{genLen}</span>
                  </div>
                </div>
              </div>

              {[
                ['URL', fUrl, setFUrl, 'text', 'https://...'],
                ['CATEGORIA', fCategory, setFCategory, 'text', 'Redes Sociais, Trabalho...'],
                ['NOTAS', fNotes, setFNotes, 'text', 'observações...'],
              ].map(([label, val, set, type, ph]: any) => (
                <div key={label} style={{ marginBottom: '16px' }}>
                  <label style={S.fLabel}>{label}</label>
                  <input style={S.input} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
                </div>
              ))}
            </div>
            <div style={S.modalFooter}>
              <button style={S.btnCancel} onClick={() => setModal('none')}>CANCELAR</button>
              <button style={S.btnPrimary} onClick={saveEntry}>{syncing ? 'SALVANDO...' : 'SALVAR'}</button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {modal === 'view' && viewEntry && (
        <div style={S.backdrop} onClick={() => setModal('none')}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalBar} />
            <div style={S.modalHeader}>
              <span style={S.modalTitle}>{viewEntry.title.toUpperCase()}</span>
              <button style={S.modalClose} onClick={() => setModal('none')}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              {viewEntry.username && <ViewField label="USUÁRIO" value={viewEntry.username} copyVal={viewEntry.username} onCopy={() => showToast('Copiado!')} />}
              <div style={{ marginBottom: '14px' }}>
                <div style={S.viewLabel}>SENHA</div>
                <div style={S.viewValue}>
                  <span style={{ flex: 1, fontFamily: "'Share Tech Mono'", letterSpacing: showViewPw ? '1px' : '4px' }}>
                    {showViewPw ? viewEntry.password : '•'.repeat(Math.min(viewEntry.password.length, 20))}
                  </span>
                  <button style={S.copyBtn} onClick={() => setShowViewPw(!showViewPw)}>{showViewPw ? '🙈' : '👁'}</button>
                  <button style={S.copyBtn} onClick={() => navigator.clipboard.writeText(viewEntry.password).then(() => showToast('Senha copiada!'))}>📋</button>
                </div>
              </div>
              {viewEntry.url && <ViewField label="URL" value={viewEntry.url} copyVal={viewEntry.url} onCopy={() => showToast('Copiado!')} />}
              {viewEntry.category && <ViewField label="CATEGORIA" value={viewEntry.category} />}
              {viewEntry.notes && <ViewField label="NOTAS" value={viewEntry.notes} />}
              <ViewField label="ATUALIZADO" value={new Date(viewEntry.updatedAt).toLocaleString('pt-BR')} />
            </div>
            <div style={S.modalFooter}>
              <button style={S.btnCancel} onClick={() => { setModal('none'); openEdit(viewEntry.id) }}>✏ EDITAR</button>
              <button style={S.btnPrimary} onClick={() => setModal('none')}>FECHAR</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 500, background: '#111318', border: `1px solid #2a2e3a`, borderLeft: `3px solid ${toast.type === 'danger' ? '#ff4560' : toast.type === 'warn' ? '#ffa726' : '#00e5a0'}`, padding: '12px 20px', fontFamily: "'Share Tech Mono'", fontSize: '11px', letterSpacing: '1px', color: '#e8eaf0' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function ViewField({ label, value, copyVal, onCopy }: { label: string; value: string; copyVal?: string; onCopy?: () => void }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={S.viewLabel}>{label}</div>
      <div style={S.viewValue}>
        <span style={{ flex: 1, fontFamily: "'Share Tech Mono'", wordBreak: 'break-all' as const }}>{value}</span>
        {copyVal && onCopy && (
          <button style={S.copyBtn} onClick={() => navigator.clipboard.writeText(copyVal).then(onCopy)}>📋</button>
        )}
      </div>
    </div>
  )
}

// ─── Styles object ────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  bg: { minHeight: '100vh', background: '#0a0b0d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", position: 'relative', overflow: 'hidden' },
  gridBg: { position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,160,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,160,0.03) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none', zIndex: 0 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', zIndex: 1, width: '100%', maxWidth: '400px', padding: '24px' },
  symbol: { fontSize: '56px', filter: 'drop-shadow(0 0 20px #00e5a0)' },
  logoTitle: { fontSize: '42px', fontWeight: 800, letterSpacing: '12px', color: '#00e5a0', margin: '8px 0 4px' },
  logoSub: { fontFamily: "'Share Tech Mono'", color: '#5a6075', fontSize: '10px', letterSpacing: '3px' },
  card: { background: '#111318', border: '1px solid #2a2e3a', width: '100%', position: 'relative' },
  cardBar: { position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,transparent,#00e5a0,transparent)' },
  lockLabel: { fontFamily: "'Share Tech Mono'", fontSize: '10px', letterSpacing: '3px', color: '#00e5a0', marginBottom: '12px', display: 'block' },
  input: { width: '100%', background: '#0a0b0d', border: '1px solid #2a2e3a', color: '#e8eaf0', fontFamily: "'Share Tech Mono'", fontSize: '14px', padding: '12px 14px', outline: 'none', boxSizing: 'border-box', letterSpacing: '1px' },
  hint: { fontFamily: "'Share Tech Mono'", fontSize: '10px', color: '#5a6075', lineHeight: 1.7, margin: '14px 0' },
  error: { fontFamily: "'Share Tech Mono'", fontSize: '11px', color: '#ff4560', letterSpacing: '1px', marginBottom: '12px' },
  btnPrimary: { width: '100%', background: '#00e5a0', border: 'none', color: '#000', fontFamily: "'Syne'", fontWeight: 700, fontSize: '13px', letterSpacing: '3px', padding: '14px', cursor: 'pointer', textTransform: 'uppercase' },
  btnLink: { background: 'none', border: 'none', color: '#5a6075', fontFamily: "'Share Tech Mono'", fontSize: '11px', letterSpacing: '1px', cursor: 'pointer', marginTop: '12px', width: '100%', textAlign: 'center' },
  header: { borderBottom: '1px solid #2a2e3a', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(10,11,13,0.95)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 50 },
  statusBadge: { fontFamily: "'Share Tech Mono'", fontSize: '10px', color: '#5a6075', letterSpacing: '2px', padding: '4px 10px', border: '1px solid #2a2e3a', background: '#111318', display: 'flex', alignItems: 'center', gap: '6px' },
  statusDot: { display: 'inline-block', width: '6px', height: '6px', background: '#00e5a0', borderRadius: '50%' },
  btnIcon: { background: '#111318', border: '1px solid #2a2e3a', color: '#5a6075', fontFamily: "'Share Tech Mono'", fontSize: '11px', padding: '8px 14px', cursor: 'pointer', letterSpacing: '1px' },
  statsBar: { display: 'flex', gap: '24px', padding: '10px 28px', borderBottom: '1px solid #2a2e3a', background: '#111318', position: 'relative', zIndex: 1 },
  sidebar: { borderRight: '1px solid #2a2e3a', background: '#111318', paddingTop: '20px', position: 'relative', zIndex: 1 },
  sideLabel: { fontFamily: "'Share Tech Mono'", fontSize: '9px', letterSpacing: '3px', color: '#5a6075', marginBottom: '10px' },
  catItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', cursor: 'pointer', fontFamily: "'Share Tech Mono'", fontSize: '11px', color: '#5a6075', borderLeft: '2px solid transparent', letterSpacing: '1px' },
  catItemActive: { borderLeftColor: '#00e5a0', color: '#00e5a0', background: 'rgba(0,229,160,0.05)' },
  catCount: { background: '#0a0b0d', border: '1px solid #2a2e3a', padding: '2px 8px', fontSize: '10px', borderRadius: '2px' },
  btnAddSide: { width: '100%', background: 'rgba(0,229,160,0.08)', border: '1px dashed rgba(0,229,160,0.3)', color: '#00e5a0', fontFamily: "'Share Tech Mono'", fontSize: '11px', letterSpacing: '2px', padding: '12px', cursor: 'pointer' },
  pwCard: { background: '#111318', border: '1px solid #2a2e3a', padding: '18px', cursor: 'pointer', transition: 'all 0.2s' },
  btnSm: { background: '#0a0b0d', border: '1px solid #2a2e3a', color: '#5a6075', fontFamily: "'Share Tech Mono'", fontSize: '10px', padding: '6px 10px', cursor: 'pointer', letterSpacing: '1px', flex: 1 },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' },
  modalBox: { background: '#111318', border: '1px solid #2a2e3a', width: '480px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' },
  modalBar: { position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,transparent,#00e5a0,transparent)' },
  modalHeader: { padding: '22px 26px 18px', borderBottom: '1px solid #2a2e3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontFamily: "'Share Tech Mono'", fontSize: '11px', letterSpacing: '3px', color: '#00e5a0' },
  modalClose: { background: 'none', border: '1px solid #2a2e3a', color: '#5a6075', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px' },
  modalFooter: { padding: '18px 26px', borderTop: '1px solid #2a2e3a', display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  fLabel: { display: 'block', fontFamily: "'Share Tech Mono'", fontSize: '9px', letterSpacing: '3px', color: '#5a6075', marginBottom: '7px' },
  btnCancel: { background: 'none', border: '1px solid #2a2e3a', color: '#5a6075', fontFamily: "'Share Tech Mono'", fontSize: '11px', padding: '10px 18px', cursor: 'pointer', letterSpacing: '2px' },
  btnToggle: { background: '#0a0b0d', border: '1px solid #2a2e3a', color: '#5a6075', padding: '0 14px', cursor: 'pointer', fontSize: '16px' },
  genBtn: { background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', color: '#00e5a0', fontFamily: "'Share Tech Mono'", fontSize: '10px', padding: '5px 12px', cursor: 'pointer', letterSpacing: '1px' },
  viewLabel: { fontFamily: "'Share Tech Mono'", fontSize: '9px', letterSpacing: '3px', color: '#5a6075', marginBottom: '6px' },
  viewValue: { background: '#0a0b0d', border: '1px solid #2a2e3a', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' },
  copyBtn: { background: 'none', border: '1px solid #2a2e3a', color: '#5a6075', fontSize: '14px', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}
