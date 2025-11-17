import { Storage } from "@google-cloud/storage";

const storage = new Storage(); // uses default credentials in GCP

// Read from env var so you can change buckets per env.
const BUCKET_NAME = process.env.BUCKET_NAME;

if (!BUCKET_NAME) {
  console.warn("WARNING: BUCKET_NAME env var not set!");
}

const bucket = BUCKET_NAME ? storage.bucket(BUCKET_NAME) : null;

export { storage, bucket, BUCKET_NAME };
