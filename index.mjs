// index.mjs
import express from "express";
import cors from "cors";
import multer from "multer";
import { bucket, BUCKET_NAME } from "./lib/storage.js"; // IMPORTANT: use this only
import dotenv from "dotenv";
dotenv.config();

const upload = multer();

const app = express();
const PORT = process.env.PORT || 8080;

const AUTH_TOKEN =
  process.env.BACKEND_AUTH_TOKEN || process.env.AUTH_TOKEN || null;

// -----------------------------
// AUTH CHECK
// -----------------------------
function checkAuth(req, res) {
  if (!AUTH_TOKEN) return true;

  let header =
    req.get("x-pt-auth") ||
    req.get("X-PT-Auth") ||
    req.get("authorization");

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

// -----------------------------
// CORS
// -----------------------------
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-PT-Auth"],
  })
);

app.use(express.json({ limit: "25mb" }));

// Log bucket status
if (!bucket) {
  console.warn("⚠️ BUCKET_NAME not set — uploads disabled.");
} else {
  console.log("📦 Using bucket:", BUCKET_NAME);
}

// -----------------------------
// HEALTH CHECKS
// -----------------------------
app.get("/healthz", async (req, res) => {
  try {
    if (!bucket) throw new Error("Bucket not configured");
    await bucket.getMetadata();
    res.json({ ok: true, bucket: BUCKET_NAME });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/", (req, res) => {
  res.json({ ok: true, msg: "Pic-Time backend alive" });
});

// -----------------------------
// CREATE ALBUM
// -----------------------------
// -----------------------------
// CREATE ALBUM
// -----------------------------
app.post("/api/create-album", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const { projectId, albumName, fullMetadata, photos, domain } = req.body;

  try {
    const safeAlbumName = albumName.toLowerCase().replace(/\s+/g, "-");
    const safeDomain = (domain || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    // NEW: domain/album_projectId
    const albumPath = `${safeDomain}/${safeAlbumName}_${projectId}`;
    const nowIso = new Date().toISOString();

    const summaryMetadata = {
      galleryName: fullMetadata?.name || "",
      clientName: fullMetadata?.user?.name || "",
      clientEmail: fullMetadata?.user?.email || "",
      eventDate:
        fullMetadata?.projectDate || fullMetadata?.details?.eventDate || "",
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
      createdAt: nowIso,
    };

    const fileRef = bucket.file(`${albumPath}/album.json`);

    await fileRef.save(JSON.stringify(fullMetadata, null, 2), {
      contentType: "application/json",
    });

    await fileRef.setMetadata({ metadata: summaryMetadata });

    res.json({ ok: true, albumPath });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// -----------------------------
// UPLOAD IMAGE
// -----------------------------
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!checkAuth(req, res)) return;
    if (!bucket) return res.status(500).json({ ok: false, error: "Bucket not configured" });

    const { filename, albumName, projectId, scene, photoId } = req.body;

    if (!filename || !albumName || !projectId) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: filename, albumName, projectId",
      });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Missing file" });
    }

    const safeAlbumName = albumName.toLowerCase().replace(/\s+/g, "-");
    const objectPath = `${safeAlbumName}_${projectId}/images/${filename}`;
    const fileRef = bucket.file(objectPath);

    const [exists] = await fileRef.exists();

    const nowIso = new Date().toISOString();

    if (exists) {
      await fileRef.setMetadata({
        metadata: {
          scene: scene || "",
          photoId: photoId || "",
          originalName: filename,
          updatedAt: nowIso,
        },
      });
      return res.json({ ok: true, skipped: true, objectPath });
    }
//custom meta data
    await fileRef.save(req.file.buffer, {
      resumable: false,
      metadata: {
        contentType: req.file.mimetype || "image/jpeg",
        metadata: {
          scene: scene || "",
          photoId: photoId || "",
          originalName: filename,
          uploadedAt: nowIso,
        },
      },
    });

    res.json({ ok: true, uploaded: true, objectPath });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});


// --- SET IMAGE METADATA AFTER SIGNED-URL UPLOAD ---
app.post("/api/set-image-metadata", async (req, res) => {
  if (!checkAuth(req, res)) return;

  try {
    const { filename, albumName, projectId, scene, photoId, domain } = req.body;

    if (!filename || !albumName || !projectId || !domain) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    const safeAlbum = albumName.toLowerCase().replace(/\s+/g, "-");
    const safeDomain = (domain || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    const albumPath = `${safeDomain}/${safeAlbum}_${projectId}`;
    const objectPath = `${albumPath}/images/${filename}`;
    const fileRef = bucket.file(objectPath);

    const nowIso = new Date().toISOString();

    await fileRef.setMetadata({
      metadata: {
        scene: scene || "",
        photoId: photoId || "",
        originalName: filename,
        uploadedAt: nowIso,
      },
    });

    res.json({ ok: true, objectPath });
  } catch (err) {
    console.error("Metadata update error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- SIGNED URL ENDPOINT ---
app.post("/api/get-upload-url", async (req, res) => {
  if (!checkAuth(req, res)) return;

  try {
    const { filename, albumName, projectId, domain } = req.body;

    if (!filename || !albumName || !projectId || !domain) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    const safeAlbum = albumName.toLowerCase().replace(/\s+/g, "-");
    const safeDomain = (domain || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    const albumPath = `${safeDomain}/${safeAlbum}_${projectId}`;
    const objectPath = `${albumPath}/images/${filename}`;
    const file = bucket.file(objectPath);

    const [exists] = await file.exists();

    if (exists) {
      await file.setMetadata({
        metadata: {
          originalName: filename,
          lastCheckedAt: new Date().toISOString(),
        },
      });

      return res.json({
        ok: true,
        skipped: true,
        objectPath,
      });
    }

    const options = {
      version: "v4",
      action: "write",
      expires: Date.now() + 10 * 60 * 1000,
      contentType: "application/octet-stream",
    };

    const [uploadUrl] = await file.getSignedUrl(options);

    res.json({
      ok: true,
      skipped: false,
      uploadUrl,
      objectPath,
    });
  } catch (err) {
    console.error("Signed URL error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// -----------------------------
// START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
