import { createClient } from '@libsql/client/web';
import { readEnv, readOptionalEnv } from './auth';

export type WebPushSubscriptionRecord = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type NativePushSubscriptionRecord = {
  platform: 'android' | 'ios';
  token: string;
};

export type PushSubscriptionRecord = WebPushSubscriptionRecord | NativePushSubscriptionRecord;

export type PushSubscriptionInsert = {
  subscription: PushSubscriptionRecord;
  locale: string | null;
  userAgent: string | null;
};

export function getPushSubscribePublicKey(): string {
  return readOptionalEnv('PUSH_STAGING_SUBSCRIBE_PUBLIC_KEY').trim()
    || readOptionalEnv('PUSH_SUBSCRIBE_PUBLIC_KEY').trim();
}

export async function upsertPushSubscription(input: PushSubscriptionInsert): Promise<void> {
  const client = createSubscriptionsClient();

  try {
    const now = new Date().toISOString();
    const endpoint = getStoredEndpoint(input.subscription);
    const subscriptionJson = JSON.stringify(normalizeStoredSubscription(input.subscription));

    await client.execute({
      sql: `
        INSERT INTO push_subscriptions (
          id,
          endpoint,
          subscription_json,
          locale,
          user_agent,
          active,
          updated_at,
          last_failure_at,
          last_failure_reason
        ) VALUES (?, ?, ?, ?, ?, 1, ?, NULL, NULL)
        ON CONFLICT(endpoint) DO UPDATE SET
          subscription_json = excluded.subscription_json,
          locale = excluded.locale,
          user_agent = excluded.user_agent,
          active = 1,
          updated_at = excluded.updated_at,
          last_failure_at = NULL,
          last_failure_reason = NULL
      `,
      args: [crypto.randomUUID(), endpoint, subscriptionJson, input.locale, input.userAgent, now],
    });
  } finally {
    client.close();
  }
}

export function readPushSubscriptionRequest(body: unknown): PushSubscriptionRecord | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const nativeSubscription = readNativePushSubscription(candidate);

  if (nativeSubscription) {
    return nativeSubscription;
  }

  const endpoint = typeof candidate.endpoint === 'string' ? candidate.endpoint.trim() : '';
  const keys = candidate.keys;

  if (!endpoint || !keys || typeof keys !== 'object') {
    return null;
  }

  const parsedKeys = keys as Record<string, unknown>;
  const p256dh = typeof parsedKeys.p256dh === 'string' ? parsedKeys.p256dh.trim() : '';
  const auth = typeof parsedKeys.auth === 'string' ? parsedKeys.auth.trim() : '';

  if (!p256dh || !auth) {
    return null;
  }

  return {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  };
}

function createSubscriptionsClient() {
  return createClient({
    url: readEnv('TURSO_SUBSCRIPTIONS_DATABASE_URL'),
    authToken: readEnv('TURSO_SUBSCRIPTIONS_AUTH_TOKEN'),
    fetch: createWorkerSafeFetch(),
  });
}

function readNativePushSubscription(candidate: Record<string, unknown>): NativePushSubscriptionRecord | null {
  const platform = candidate.platform;
  const token = typeof candidate.token === 'string' ? candidate.token.trim() : '';

  if ((platform === 'android' || platform === 'ios') && token.length > 0) {
    return {
      platform,
      token,
    };
  }

  return null;
}

function normalizeStoredSubscription(subscription: PushSubscriptionRecord): Record<string, unknown> {
  if (isNativePushSubscription(subscription)) {
    return {
      platform: subscription.platform,
      token: subscription.token,
    };
  }

  return {
    platform: 'web',
    endpoint: subscription.endpoint,
    keys: subscription.keys,
  };
}

function getStoredEndpoint(subscription: PushSubscriptionRecord): string {
  return isNativePushSubscription(subscription)
    ? `${subscription.platform}:${subscription.token}`
    : subscription.endpoint;
}

function isNativePushSubscription(subscription: PushSubscriptionRecord): subscription is NativePushSubscriptionRecord {
  return 'platform' in subscription && 'token' in subscription;
}

function createWorkerSafeFetch():
  | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
  | undefined {
  if (typeof globalThis.fetch !== 'function') {
    return undefined;
  }

  return (input: RequestInfo | URL, init?: RequestInit) => {
    if (input && typeof input === 'object' && 'url' in input) {
      const request = input as Request;
      return globalThis.fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: request.redirect,
        signal: request.signal,
        ...(init || {}),
      });
    }

    return globalThis.fetch(input, init);
  };
}