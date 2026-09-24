import {
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand,
} from '@aws-sdk/client-ec2';
import { getEC2Client } from './aws.client';
import { AWSServiceError } from '../../shared/errors';
import { logger } from '../../shared/logger';

export interface EC2InstanceInfo {
  instanceId: string;
  state: string;
  instanceType: string;
  availabilityZone: string;
  publicIp?: string;
  privateIp?: string;
  launchTime?: Date;
  tags: Record<string, string>;
}

/**
 * Describe an EC2 instance. Used to verify the resource exists and fetch metadata.
 * Required IAM permission: ec2:DescribeInstances
 */
export async function describeEC2Instance(
  instanceId: string,
  region: string,
): Promise<EC2InstanceInfo | null> {
  const client = getEC2Client(region);

  try {
    const response = await client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      }),
    );

    const reservation = response.Reservations?.[0];
    const instance = reservation?.Instances?.[0];

    if (!instance) return null;

    const tags: Record<string, string> = {};
    for (const tag of instance.Tags ?? []) {
      if (tag.Key && tag.Value) {
        tags[tag.Key] = tag.Value;
      }
    }

    return {
      instanceId: instance.InstanceId ?? instanceId,
      state: instance.State?.Name ?? 'unknown',
      instanceType: instance.InstanceType ?? 'unknown',
      availabilityZone: instance.Placement?.AvailabilityZone ?? region,
      publicIp: instance.PublicIpAddress,
      privateIp: instance.PrivateIpAddress,
      launchTime: instance.LaunchTime,
      tags,
    };
  } catch (err) {
    const error = err as { name?: string; message?: string };
    logger.warn({
      msg: 'EC2 DescribeInstances failed',
      instanceId,
      region,
      errorName: error.name,
      errorMessage: error.message,
    });
    throw new AWSServiceError(
      `Could not describe EC2 instance ${instanceId}: ${error.message ?? 'unknown'}`,
      error.name,
    );
  }
}

/**
 * Check if an EC2 instance is running and passing status checks.
 * Required IAM permission: ec2:DescribeInstanceStatus
 */
export async function getEC2InstanceStatus(
  instanceId: string,
  region: string,
): Promise<{ running: boolean; statusCheck: string }> {
  const client = getEC2Client(region);

  try {
    const response = await client.send(
      new DescribeInstanceStatusCommand({
        InstanceIds: [instanceId],
        IncludeAllInstances: true,
      }),
    );

    const status = response.InstanceStatuses?.[0];
    const state = status?.InstanceState?.Name ?? 'unknown';
    const check = status?.InstanceStatus?.Status ?? 'unknown';

    return {
      running: state === 'running',
      statusCheck: check,
    };
  } catch (err) {
    const error = err as { name?: string; message?: string };
    logger.warn({
      msg: 'EC2 DescribeInstanceStatus failed',
      instanceId,
      region,
      errorMessage: error.message,
    });
    return { running: false, statusCheck: 'error' };
  }
}
