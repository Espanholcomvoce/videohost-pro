const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Backblaze B2 - S3-compatible API
const s3 = new S3Client({
  region: process.env.B2_REGION || 'us-west-004',
  endpoint: `https://s3.${process.env.B2_REGION || 'us-west-004'}.backblazeb2.com`,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY
  }
});

const BUCKET = process.env.B2_BUCKET_NAME;

async function uploadToR2(key, body, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
  return getR2PublicUrl(key);
}

async function getSignedR2Url(key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

async function deleteFromR2(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function deleteR2Folder(prefix) {
  let continuationToken;
  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }));
    if (list.Contents) {
      for (const obj of list.Contents) {
        await deleteFromR2(obj.Key);
      }
    }
    continuationToken = list.NextContinuationToken;
  } while (continuationToken);
}

function getR2PublicUrl(key) {
  return `${process.env.B2_PUBLIC_URL}/${key}`;
}

module.exports = { uploadToR2, getSignedR2Url, deleteFromR2, deleteR2Folder, getR2PublicUrl, s3, BUCKET };
