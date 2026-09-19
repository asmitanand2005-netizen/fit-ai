import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // List of protected routes
  const protectedRoutes = [
    '/dashboard',
    '/workout',
    '/plan',
    '/progress',
    '/library',
    '/onboarding',
    '/assistant',
    '/coach',
    '/admin'
  ]

  const isProtected = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtected) {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.redirect(new URL('/auth/signin', request.url))
    }

    try {
      const jwtSecret = process.env.JWT_SECRET
      if (!jwtSecret || jwtSecret.length < 32) {
        console.warn('Middleware: JWT_SECRET environment variable is missing or too short')
        return NextResponse.redirect(new URL('/auth/signin', request.url))
      }

      const encodedSecret = new TextEncoder().encode(jwtSecret)
      const { payload } = await jwtVerify(token, encodedSecret)
      const role = payload.role as string

      // RBAC rules:
      // 1. Only ADMIN can access /admin
      if (pathname.startsWith('/admin') && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }

      // 2. Only COACH or ADMIN can access /coach
      if (pathname.startsWith('/coach') && role !== 'COACH' && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    } catch (error) {
      console.error('Middleware JWT validation failed:', error)
      // Token is invalid/expired, clear cookie and redirect
      const response = NextResponse.redirect(new URL('/auth/signin', request.url))
      response.cookies.delete('auth-token')
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/workout/:path*',
    '/plan/:path*',
    '/progress/:path*',
    '/library/:path*',
    '/onboarding/:path*',
    '/assistant/:path*',
    '/coach/:path*',
    '/admin/:path*'
  ]
}
