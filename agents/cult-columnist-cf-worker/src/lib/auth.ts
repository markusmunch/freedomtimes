import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../types';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(domain: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  }
  return jwks;
}

function getRoleClaims(namespace: string | undefined): string[] {
  const ns = (namespace ?? '').trim().replace(/\/$/, '');
  if (!ns) {
    return ['roles'];
  }
  return [ns, 'roles'];
}

function hasEditorialRole(payload: JWTPayload, namespace: string | undefined): boolean {
  const allowed = new Set(['admin', 'editor']);

  for (const claim of getRoleClaims(namespace)) {
    const value = payload[claim];
    if (Array.isArray(value) && value.some((v) => allowed.has(String(v).toLowerCase()))) {
      return true;
    }
  }

  return false;
}

export async function requireEditor(request: Request, env: Env): Promise<JWTPayload> {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, getJwks(env.AUTH0_DOMAIN), {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_API_AUDIENCE,
      algorithms: ['RS256'],
    });
    payload = verified.payload;
  } catch {
    throw new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!hasEditorialRole(payload, env.AUTH0_ROLES_CLAIM_NAMESPACE)) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  return payload;
}
