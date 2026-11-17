import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { getStack } from "@pulumi/pulumi";
import { Environment } from "@pulumi/aws/appconfig";

const environment = pulumi.getStack();

if(!["dev", "prod"].includes(environment)) {
    throw new Error(`Unsupported environment: ${environment}`);
}


const config = new pulumi.Config();
const BucketName = config.require("bucketName");

const bucket = new aws.s3.Bucket("my-bucket", 
    {
        bucket: BucketName,
        forceDestroy: false,
        tags: {
            Application: "buniwa",
            Environment: environment
        }
    }
);

//public access
new aws.s3.BucketPublicAccessBlock("bucket-public-access", {
  bucket: bucket.id,
  blockPublicAcls: true,
  ignorePublicAcls: true,
  blockPublicPolicy: true,
  restrictPublicBuckets: true,
});


// IAM role Firehose assumes to write to the bucket
const firehoseRole = new aws.iam.Role("firehose-role", {
  assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
    statements: [{
      effect: "Allow",
      actions: ["sts:AssumeRole"],
      principals: [{
        type: "Service",
        identifiers: ["firehose.amazonaws.com"],
      }],
    }],
  }).json,
});

const firehosePolicy = new aws.iam.RolePolicy(
  "firehose-policy",
  {
    role: firehoseRole.id,
    policy: aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          effect: "Allow",
          actions: [
            "s3:PutObject",
            "s3:GetObject",
            "s3:AbortMultipartUpload",
          ],
          resources: [
            pulumi.interpolate`${bucket.arn}/*`,
          ],
        },
        {
          effect: "Allow",
          actions: [
            "s3:GetBucketLocation",
            "s3:ListBucket",
            "s3:ListBucketMultipartUploads",
          ],
          resources: [bucket.arn],
        },
      ],
    }).json,
  },
);
// Firehose delivery stream that writes to the bucket
const firehose = new aws.kinesis.FirehoseDeliveryStream(
    "my-firehose", {
    destination: "extended_s3",
    extendedS3Configuration: {
        roleArn: firehoseRole.arn,
        bucketArn: bucket.arn,
        bufferingSize: 5,      // MB
        bufferingInterval: 300, // seconds
    },
}, { dependsOn: [bucket] });

// Export the name of the bucket and the stream
export const bucketName = bucket.id;
export const firehoseName = firehose.name;
export const stackName = environment;
