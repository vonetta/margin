const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const crypto = require("crypto");

let client = null;

const getClient = () => {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
};

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const sanitizeName = (name = "file") => {
  return (
    name
      .toLowerCase()
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file"
  );
};

const uploadFile = async ({
  ministryId,
  category,
  buffer,
  contentType,
  originalName,
}) => {
  if (!ministryId) throw new Error("ministryId is required");
  if (!category) throw new Error("category is required");
  if (!buffer || !Buffer.isBuffer(buffer))
    throw new Error("A file buffer is required");

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    throw new Error(`Unsupported file type: ${contentType}`);
  }

  const hash = crypto.randomBytes(4).toString("hex");
  const base = sanitizeName(originalName);
  const key = `${ministryId}/${category}/${base}-${hash}.${ext}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return {
    key,
    url: `${process.env.R2_PUBLIC_URL}/${key}`,
  };
};

const deleteFile = async (key) => {
  if (!key) throw new Error("key is required");
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    }),
  );
  return { deleted: true, key };
};

module.exports = { uploadFile, deleteFile, sanitizeName, ALLOWED_TYPES };
