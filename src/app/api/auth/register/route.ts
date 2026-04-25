import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb, initDb } from '@/lib/db'
import { signToken, setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password || password.length < 6)
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

    await initDb()
    const sql = getDb()

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`
    if (existing.length > 0)
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })

    const hash = await bcrypt.hash(password, 12)
    const [user] = await sql`
      INSERT INTO users (email, password_hash) VALUES (${email}, ${hash})
      RETURNING id, email
    `

    const token = await signToken(user.id, user.email)
    setSessionCookie(token)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
