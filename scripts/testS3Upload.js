require("dotenv").config()

const QRCode = require("qrcode")
const { uploadQrPng } = require("../services/s3Service")

async function main() {
  const qrCodeText = process.env.TEST_QR_CODE_TEXT || "LPA:1$test.smdp.example$TEST-MATCHING-ID"
  const orderId = process.env.TEST_ORDER_ID || `test-order-${Date.now()}`
  const iccid = process.env.TEST_ICCID || "test-iccid"

  const pngBuffer = await QRCode.toBuffer(qrCodeText, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 640
  })

  const result = await uploadQrPng({
    orderId,
    iccid,
    pngBuffer
  })

  console.log("S3 QR upload succeeded")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error("S3 QR upload failed")
  console.error({
    name: error.name,
    message: error.message,
    code: error.Code || error.code,
    statusCode: error.$metadata?.httpStatusCode
  })
  process.exit(1)
})
