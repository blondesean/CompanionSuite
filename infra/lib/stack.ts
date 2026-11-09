import * as path from 'node:path';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const ROOT = path.resolve(__dirname, '../..');
export const VAPID_PARAM = '/companionsuite/vapid';

export class CompanionSuiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ---------- data ----------
    // One table for everything (pk = collection, sk = item key). On-demand
    // billing costs fractions of a cent at two-person scale.
    const table = new dynamodb.Table(this, 'Data', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---------- users ----------
    // No self sign-up: accounts are created with `npm run add-user`.
    const userPool = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.NONE,
      featurePlan: cognito.FeaturePlan.LITE,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const webClient = userPool.addClient('Web', {
      authFlows: { userPassword: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(365), // stay signed in on your phones
    });

    // ---------- website ----------
    const siteBucket = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      // Single-page app: unknown paths serve index.html.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });
    const siteUrl = `https://${distribution.distributionDomainName}`;

    // ---------- functions ----------
    const functionDefaults: NodejsFunctionProps = {
      entry: path.join(ROOT, 'api/src/lambda.ts'),
      projectRoot: ROOT,
      depsLockFilePath: path.join(ROOT, 'package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(15),
      bundling: { minify: true, sourceMap: true, target: 'node22' },
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        VAPID_PARAM,
        SITE_URL: siteUrl,
        NODE_OPTIONS: '--enable-source-maps',
      },
    };

    const apiFn = new NodejsFunction(this, 'ApiFn', {
      ...functionDefaults,
      handler: 'api',
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    const reminderFn = new NodejsFunction(this, 'ReminderFn', {
      ...functionDefaults,
      handler: 'reminders',
      timeout: Duration.seconds(50),
      logGroup: new logs.LogGroup(this, 'ReminderLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    const readVapid = new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:${this.partition}:ssm:${this.region}:${this.account}:parameter${VAPID_PARAM}`],
    });
    for (const fn of [apiFn, reminderFn]) {
      table.grantReadWriteData(fn);
      fn.addToRolePolicy(readVapid);
    }
    userPool.grant(apiFn, 'cognito-idp:ListUsers');

    new events.Rule(this, 'ReminderTick', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(reminderFn)],
    });

    // ---------- API ----------
    const api = new apigw.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: ['*'], // auth is a bearer token, not cookies
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.PUT,
          apigw.CorsHttpMethod.DELETE,
        ],
        maxAge: Duration.days(1),
      },
    });
    // Explicit methods (not ANY) so CORS preflight OPTIONS never hits the authorizer.
    api.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST, apigw.HttpMethod.PUT, apigw.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFn),
      authorizer: new HttpUserPoolAuthorizer('Cognito', userPool, { userPoolClients: [webClient] }),
    });
    // Cap request rate as a cost guard.
    const stage = api.defaultStage!.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 20 };

    // ---------- deploy the frontend ----------
    const dist = path.join(ROOT, 'frontend/dist');
    // Hashed assets never change, so cache them forever...
    const assets = new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset(path.join(dist, 'assets'))],
      destinationBucket: siteBucket,
      destinationKeyPrefix: 'assets/',
      cacheControl: [s3deploy.CacheControl.fromString('public,max-age=31536000,immutable')],
      prune: false,
    });
    // ...while index.html, the service worker and config must always be fresh.
    const shell = new s3deploy.BucketDeployment(this, 'DeployShell', {
      sources: [
        s3deploy.Source.asset(dist, { exclude: ['assets', 'assets/**'] }),
        s3deploy.Source.jsonData('config.json', {
          apiUrl: api.apiEndpoint,
          region: this.region,
          userPoolId: userPool.userPoolId,
          userPoolClientId: webClient.userPoolClientId,
        }),
      ],
      destinationBucket: siteBucket,
      cacheControl: [s3deploy.CacheControl.noCache()],
      prune: false,
      distribution,
      distributionPaths: ['/*'],
    });
    shell.node.addDependency(assets);

    new CfnOutput(this, 'SiteUrl', { value: siteUrl });
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: webClient.userPoolClientId });
    new CfnOutput(this, 'TableName', { value: table.tableName });
  }
}
