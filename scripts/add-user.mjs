// Creates a login for one of you. Usage:
//   npm run add-user -- you@example.com "Your Name"
// Prints a temporary password; the app asks for a new one at first sign-in.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AdminCreateUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();
if (!email || !name) {
  console.error('Usage: npm run add-user -- <email> "<Name>"');
  process.exit(1);
}

let outputs;
try {
  outputs = JSON.parse(readFileSync(new URL('../infra/outputs.json', import.meta.url), 'utf8')).CompanionSuite;
} catch {
  console.error('infra/outputs.json not found — run `npm run deploy` first.');
  process.exit(1);
}

const tempPassword = `Tmp-${randomBytes(6).toString('base64url')}9`;
await new CognitoIdentityProviderClient({}).send(
  new AdminCreateUserCommand({
    UserPoolId: outputs.UserPoolId,
    Username: email.toLowerCase(),
    TemporaryPassword: tempPassword,
    MessageAction: 'SUPPRESS', // no email; share the password yourself
    UserAttributes: [
      { Name: 'email', Value: email.toLowerCase() },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: name },
    ],
  }),
);

console.log(`\nCreated ${name} <${email.toLowerCase()}>`);
console.log(`Temporary password: ${tempPassword}`);
console.log(`Sign in at ${outputs.SiteUrl} — you'll be asked to choose a new password.\n`);
