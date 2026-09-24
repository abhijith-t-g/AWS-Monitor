import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SSMClient } from '@aws-sdk/client-ssm';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { env } from '../../config/env';

/**
 * Creates an AWS SDK client for the given service.
 *
 * Credential resolution order (AWS SDK provider chain):
 *  1. Environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
 *  2. ~/.aws/credentials file
 *  3. ECS task role
 *  4. EC2 instance profile / IAM role
 *
 * This means the application works with IAM roles in AWS and with
 * explicit credentials outside AWS — no code changes required.
 */
function createClientConfig(region: string) {
  return {
    region,
    credentials: fromNodeProviderChain(),
    ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
  };
}

// Client caches — one client per region to reuse connections
const cloudwatchClients = new Map<string, CloudWatchClient>();
const ec2Clients = new Map<string, EC2Client>();
const ssmClients = new Map<string, SSMClient>();

export function getCloudWatchClient(region: string): CloudWatchClient {
  if (!cloudwatchClients.has(region)) {
    cloudwatchClients.set(region, new CloudWatchClient(createClientConfig(region)));
  }
  return cloudwatchClients.get(region)!;
}

export function getEC2Client(region: string): EC2Client {
  if (!ec2Clients.has(region)) {
    ec2Clients.set(region, new EC2Client(createClientConfig(region)));
  }
  return ec2Clients.get(region)!;
}

export function getSSMClient(region: string): SSMClient {
  if (!ssmClients.has(region)) {
    ssmClients.set(region, new SSMClient(createClientConfig(region)));
  }
  return ssmClients.get(region)!;
}

/** Destroy all cached clients (for graceful shutdown) */
export function destroyAWSClients(): void {
  cloudwatchClients.forEach((c) => c.destroy());
  ec2Clients.forEach((c) => c.destroy());
  ssmClients.forEach((c) => c.destroy());
  cloudwatchClients.clear();
  ec2Clients.clear();
  ssmClients.clear();
}
