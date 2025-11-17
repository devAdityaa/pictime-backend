// index.mjs
// Final optimized Pic-Time → GCP uploader backend
// Clean, consistent, and uses ONLY /api/upload
// Stores files into: project-<projectId>/<album-name>/images/<filename>

import express from "express";
import cors from "cors";
import { Storage } from "@google-cloud/storage";
import multer from "multer";
const upload = multer();

const app = express();
const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.BACKEND_AUTH_TOKEN || process.env.AUTH_TOKEN || null;




function checkAuth(req, res) {
  // If no token configured on server, skip auth (useful for local dev)
  if (!AUTH_TOKEN) return true;

  // Look for header: X-PT-Auth: <token>  or Authorization: Bearer <token>
  let header = req.get("x-pt-auth") || req.get("X-PT-Auth") || req.get("authorization");
  if (!header) {
    res.status(401).json({ ok: false, error: "Missing auth header" });
    return false;
  }

  if (header.toLowerCase().startsWith("bearer ")) {
    header = header.slice(7).trim();
  }

  if (header !== AUTH_TOKEN) {
    res.status(403).json({ ok: false, error: "Invalid auth token" });
    return false;
  }

  return true;
}


// Basic CORS / Preflight
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PT-Auth");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "25mb" }));

// Google Cloud Storage setup
const BUCKET_NAME = process.env.BUCKET_NAME;
const storage = new Storage();
let bucket = BUCKET_NAME ? storage.bucket(BUCKET_NAME) : null;

if (!bucket) {
  console.warn("⚠️ BUCKET_NAME not set — uploads disabled.");
} else {
  console.log("📦 Using bucket:", BUCKET_NAME);
}

// Health Check
app.get("/healthz", async (req, res) => {
  try {
    if (!bucket) throw new Error("Bucket not configured");
    await bucket.getMetadata();
    res.json({ ok: true, bucket: BUCKET_NAME });
  } catch (err) {
    console.error("healthz error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Root ping
app.get("/", (req, res) => {
  res.json({ ok: true, msg: "Pic-Time backend alive" });
});

/*
|--------------------------------------------------------------------------
|  FINAL SINGLE ENDPOINT: /api/upload
|--------------------------------------------------------------------------
| Accepts multipart/form-data including:
|   file        (image blob)
|   filename
|   albumName
|   projectId
|   scene
|   photoId
|
| Stores to: project-<projectId>/<album>/images/<filename>
| Skips upload if file exists — but updates metadata.
|--------------------------------------------------------------------------
*/

app.post("/api/create-album", async (req, res) => {
  if (!checkAuth(req, res)) return;   // 🔐 NEW
  
  const { projectId, albumName, virtualPath, fullMetadata, photos } = req.body;

  try {
    const safeAlbumName = albumName.toLowerCase().replace(/\s+/g, "-");
    const albumPath = `${safeAlbumName}_${projectId}`;
    const nowIso = new Date().toISOString();
    // -----------------------------
    // 1) Build TOP 10 summary fields
    // -----------------------------

    const summaryMetadata = {
      galleryName: fullMetadata?.name || "",
      clientName: fullMetadata?.user?.name || "",
      clientEmail: fullMetadata?.user?.email || "",
      eventDate: fullMetadata?.projectDate || fullMetadata?.details?.eventDate || "",
      allowDownload: String(fullMetadata?.allowDownload),
      allowHiResDownload: String(fullMetadata?.allowHiResDownload),

      videoDownloadEnabled: String(
        (fullMetadata?.videoDownloadPolicy?.hiresScope ?? 0) > 0 ||
        (fullMetadata?.videoDownloadPolicy?.lowresScope ?? 0) > 0
      ),

      watermarkApplied: String(
        fullMetadata?.hasBurnedWatermark ||
        (fullMetadata?.blockWatermark ?? 0) > 0
      ),

      totalPhotos: String(fullMetadata?.numAllPhotos || photos?.length || 0),
      allowStore: String(fullMetadata?.allowStore),
      createdAt: nowIso
    };

    // -----------------------------
    // 2) Save the FULL metadata JSON
    // -----------------------------
    await bucket
      .file(`${albumPath}/album.json`)
      .save(JSON.stringify(fullMetadata, null, 2), {
        contentType: "application/json",
      });

    // -----------------------------
    // 3) Attach **summary metadata**
    // -----------------------------
    await bucket.file(`${albumPath}/album.json`).setMetadata({
      metadata: summaryMetadata
    });

    console.log("📁 Album metadata created for:", albumPath);

    res.json({ ok: true, albumPath });
  } catch (err) {
    console.error("create-album error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});




app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!checkAuth(req, res)) return;   // 🔐 NEW
    if (!bucket) {
      return res.status(500).json({ ok: false, error: "Bucket not configured" });
    }

    const { filename, albumName, projectId, scene, photoId } = req.body;

    if (!filename || !albumName || !projectId) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: filename, albumName, projectId"
      });
    }

    const safeAlbumName = albumName.toLowerCase().replace(/\s+/g, "-");
    const objectPath = `${safeAlbumName}_${projectId}/images/${filename}`;
    const file = bucket.file(objectPath);

    // If file exists → skip upload but refresh metadata
    const [exists] = await file.exists();
    if (exists) {
      console.log(`⏭️ Skipping existing file: ${objectPath}`);
      const nowIso = new Date().toISOString();
      await file.setMetadata({
        metadata: {
          scene: scene || "",
          photoId: photoId || "",
          originalName: filename,
          updatedAt: nowIso
        }
      });

      return res.json({ ok: true, skipped: true, objectPath });
    }

    // Upload new image
    console.log(`📤 Uploading new file: ${objectPath}`);
    const nowIso = new Date().toISOString();
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype || "image/jpeg",
        metadata: {
          scene: scene || "",
          photoId: photoId || "",
          originalName: filename,
          uploadedAt: nowIso
        }
      },
      resumable: false
    });

    return res.json({ ok: true, uploaded: true, objectPath });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
