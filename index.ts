import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { getStack } from "@pulumi/pulumi";


const bucket = new aws.s3.Bucket("my-bucket", {bucket: `karega-${getStack()}`});

// IAM role Firehose assumes to write to the bucket
const firehoseRole = new aws.iam.Role("firehose-role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { Service: "firehose.amazonaws.com" },
        }],
    }),
});

new aws.iam.RolePolicy("firehose-policy", {
    role: firehoseRole.id,
    policy: pulumi.jsonStringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "s3:AbortMultipartUpload",
                "s3:GetBucketLocation",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:ListBucketMultipartUploads",
                "s3:PutObject",
            ],
            Resource: [bucket.arn, pulumi.interpolate`${bucket.arn}/*`],
        }],
    }),
});

// Firehose delivery stream that writes to the bucket
const firehose = new aws.kinesis.FirehoseDeliveryStream("my-firehose", {
    destination: "extended_s3",
    extendedS3Configuration: {
        roleArn: firehoseRole.arn,
        bucketArn: bucket.arn,
        bufferingSize: 5,      // MB
        bufferingInterval: 300, // seconds
    },
});

// Export the name of the bucket and the stream
export const bucketName = bucket.id;
export const firehoseName = firehose.name;
