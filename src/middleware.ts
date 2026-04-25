import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('vault_session')?.value
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/dashboard')) {
    if (!token) return NextResponse.redirect(new URL('/login', req.url))
    try {
      await jwtVerify(token, secret)
    } catch {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  if ((pathname === '/login' || pathname === '/register') && token) {
    try {
      await jwtVerify(token, secret)
      return NextResponse.redirect(new URL('/dashboard', req.url))
    } catch {}
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard', '/login', '/register']
}
