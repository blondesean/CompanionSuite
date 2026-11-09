// One-time: creates the Web Push (VAPID) key pair and stores it in SSM
// Parameter Store as an encrypted SecureString. Re-run with --force to rotate
// (everyone will need to turn reminders off and on again afterwards).
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import webpush from 'web-push';

const NAME = '/companionsuite/vapid';
const force = process.argv.includes('--force');
const ssm = new SSMClient({});

try {
  await ssm.send(new GetParameterCommand({ Name: NAME }));
  if (!force) {
    console.log(`${NAME} already exists — nothing to do (use --force to rotate).`);
    process.exit(0);
  }
} catch (err) {
  if (err.name !== 'ParameterNotFound') throw err;
}

const keys = webpush.generateVAPIDKeys();
await ssm.send(
  new PutParameterCommand({
    Name: NAME,
    Type: 'SecureString',
    Value: JSON.stringify(keys),
    Overwrite: force,
    Description: 'CompanionSuite Web Push VAPID keys',
  }),
);
console.log(`Stored new VAPID keys in ${NAME}.`);
