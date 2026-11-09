// Production dependencies: DynamoDB, Cognito users as household members,
// and Web Push with VAPID keys from SSM Parameter Store.

import { randomUUID } from 'node:crypto';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import webpush from 'web-push';
import type { Member } from '../../shared/types';
import { DynamoStore } from './dynamo-store';
import type { Deps, PushSender } from './http';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const MEMBER_CACHE_MS = 5 * 60 * 1000;
let memberCache: { at: number; members: Member[] } | undefined;

async function cognitoMembers(): Promise<Member[]> {
  if (memberCache && Date.now() - memberCache.at < MEMBER_CACHE_MS) return memberCache.members;
  const client = new CognitoIdentityProviderClient({});
  const members: Member[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(new ListUsersCommand({ UserPoolId: env('USER_POOL_ID'), PaginationToken: token }));
    for (const user of res.Users ?? []) {
      if (user.Enabled === false) continue;
      const attr = (name: string) => user.Attributes?.find((a) => a.Name === name)?.Value;
      const id = attr('sub');
      if (!id) continue;
      members.push({ id, name: attr('name') || attr('email') || 'Unknown', email: attr('email') });
    }
    token = res.PaginationToken;
  } while (token);
  memberCache = { at: Date.now(), members };
  return members;
}

let vapid: Promise<{ publicKey: string; privateKey: string } | null> | undefined;

function loadVapid() {
  vapid ??= new SSMClient({})
    .send(new GetParameterCommand({ Name: env('VAPID_PARAM'), WithDecryption: true }))
    .then((res) => JSON.parse(res.Parameter?.Value ?? 'null'))
    .catch((err) => {
      console.warn('VAPID keys unavailable; push disabled.', err?.name ?? err);
      vapid = undefined; // retry on a later invocation
      return null;
    });
  return vapid;
}

const webPush: PushSender = {
  async publicKey() {
    return (await loadVapid())?.publicKey ?? null;
  },
  async send(subscription, payload) {
    const keys = await loadVapid();
    if (!keys) return 'failed';
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: { subject: env('SITE_URL'), publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60,
        urgency: 'high',
      });
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      console.error('Push failed', status, (err as { body?: string }).body);
      return 'failed';
    }
  },
};

export function awsDeps(): Deps {
  return {
    store: new DynamoStore(env('TABLE_NAME')),
    members: cognitoMembers,
    push: webPush,
    now: () => new Date(),
    newId: () => randomUUID(),
  };
}
