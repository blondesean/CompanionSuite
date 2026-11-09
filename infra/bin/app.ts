import { App } from 'aws-cdk-lib';
import { CompanionSuiteStack } from '../lib/stack';

const app = new App();
new CompanionSuiteStack(app, 'CompanionSuite', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  description: 'CompanionSuite: chores, meals and to-dos PWA',
});
