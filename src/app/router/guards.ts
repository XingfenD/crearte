import type { RouteLocationNormalized } from 'vue-router'

const AUTH_ROUTE_NAMES = new Set(['login', 'register', 'account'])

export interface NavigationContext {
  authEnabled: boolean
  authenticated: boolean
}

export type NavigationDecision = true | { name: string; query?: Record<string, string> }

export function resolveNavigation(
  to: Pick<RouteLocationNormalized, 'name' | 'meta' | 'fullPath'>,
  context: NavigationContext
): NavigationDecision {
  if (!context.authEnabled && typeof to.name === 'string' && AUTH_ROUTE_NAMES.has(to.name)) {
    return { name: 'home' }
  }
  if (context.authEnabled && to.meta.requiresAuth === true && !context.authenticated) {
    return { name: 'login', query: { next: to.fullPath } }
  }
  return true
}
