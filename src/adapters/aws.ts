import { ValidationError } from "../core/index.js";

/**
 * Connection settings shared by the AWS adapters.
 *
 * Credentials are optional: leave them out to use the AWS default credential
 * chain (IAM roles on ECS/EKS/Lambda/EC2, SSO, `AWS_*` environment variables,
 * `~/.aws` profiles). Only pass keys when you really need static credentials.
 */
export interface AwsConnectionConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  /** Custom endpoint, e.g. LocalStack (`http://localhost:4566`), MinIO or Cloudflare R2 */
  endpoint?: string;
}

/** Builds the shared part of an AWS SDK client config */
export const awsClientConfig = (config: AwsConnectionConfig, service: string) => {
  if (!config?.region) throw new ValidationError(`${service} region is required`);

  const { accessKeyId, secretAccessKey, sessionToken, endpoint, region } = config;

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new ValidationError(
      `${service}: pass both accessKeyId and secretAccessKey, or neither to use the default credential chain`,
    );
  }

  return {
    region,
    ...(endpoint && { endpoint }),
    ...(accessKeyId &&
      secretAccessKey && {
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken && { sessionToken }),
        },
      }),
  };
};
