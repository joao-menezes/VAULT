import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db'
import { signToken, setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password)
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

    const sql = getDb()
    const [user] = await sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`
    if (!user)
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok)
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })

    const token = await signToken(user.id, user.email)
    setSessionCookie(token)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
