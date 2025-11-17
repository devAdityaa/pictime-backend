// lib/storage.js
import { Storage } from "@google-cloud/storage";

export const BUCKET_NAME = process.env.BUCKET_NAME;

const storage = new Storage();

export const bucket = BUCKET_NAME ? storage.bucket(BUCKET_NAME) : null;
