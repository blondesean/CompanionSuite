// Lambda entry points. `api` sits behind API Gateway (HTTP API, payload v2)
// with a Cognito JWT authorizer; `reminders` runs every minute.

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { router } from './app';
import { awsDeps } from './aws';
import { sendDueReminders } from './reminders';

const deps = awsDeps();

export async function api(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const claims = event.requestContext.authorizer.jwt.claims;
  let body: unknown = undefined;
  if (event.body) {
    const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: 'Body must be JSON' });
    }
  }

  const res = await router.handle(
    {
      method: event.requestContext.http.method,
      path: event.rawPath,
      query: event.queryStringParameters ?? {},
      body,
      user: { id: String(claims.sub), name: String(claims.name ?? claims.email ?? '') },
    },
    deps,
  );
  return json(res.status, res.body);
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

export async function reminders(): Promise<{ processed: number }> {
  const processed = await sendDueReminders(deps);
  if (processed) console.log(`Processed ${processed} reminder(s)`);
  return { processed };
}
