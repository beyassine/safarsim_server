const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")

const s3 = new S3Client({
  region: process.env.AWS_REGION
})

const QR_CODES_BUCKET = process.env.QR_CODES_BUCKET
const QR_CODES_PUBLIC_BASE_URL = process.env.QR_CODES_PUBLIC_BASE_URL

function getPublicUrl(key) {
  if (QR_CODES_PUBLIC_BASE_URL) {
    return `${QR_CODES_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`
  }

  return `https://${QR_CODES_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
}

async function uploadQrPng({
  orderId,
  iccid,
  pngBuffer
}) {
  if (!QR_CODES_BUCKET) {
    throw new Error("QR_CODES_BUCKET is required")
  }

  const safeIccid = iccid || `qr-${Date.now()}`
  const key = `orders/${orderId}/qr-codes/${safeIccid}.png`

  await s3.send(
    new PutObjectCommand({
      Bucket: QR_CODES_BUCKET,
      Key: key,
      Body: pngBuffer,
      ContentType: "image/png"
    })
  )

  return {
    bucket: QR_CODES_BUCKET,
    key,
    url: getPublicUrl(key)
  }
}

module.exports = {
  uploadQrPng
}
