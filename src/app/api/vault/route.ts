import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET — load vault
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const sql = getDb()
  const [row] = await sql`
    SELECT encrypted_data, salt, iv FROM vault_entries WHERE user_id = ${session.userId}
  `
  return NextResponse.json(row ?? null)
}

// POST — save/update vault (full encrypted blob)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { encrypted_data, salt, iv } = await req.json()
  if (!encrypted_data || !salt || !iv)
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

  const sql = getDb()
  const existing = await sql`SELECT id FROM vault_entries WHERE user_id = ${session.userId}`

  if (existing.length > 0) {
    await sql`
      UPDATE vault_entries
      SET encrypted_data = ${encrypted_data}, salt = ${salt}, iv = ${iv}, updated_at = NOW()
      WHERE user_id = ${session.userId}
    `
  } else {
    await sql`
      INSERT INTO vault_entries (user_id, encrypted_data, salt, iv)
      VALUES (${session.userId}, ${encrypted_data}, ${salt}, ${iv})
    `
  }

  return NextResponse.json({ ok: true })
}
