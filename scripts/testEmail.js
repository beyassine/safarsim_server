require("dotenv").config()

const QRCode = require("qrcode")
const { sendEsimQrEmail } = require("../services/emailService")

async function main() {
  const to = process.env.TEST_EMAIL_TO

  if (!to) {
    throw new Error("TEST_EMAIL_TO is required")
  }

  const qrCodeText = process.env.TEST_QR_CODE_TEXT || "LPA:1$test.smdp.example$TEST-MATCHING-ID"
  const pngBuffer = await QRCode.toBuffer(qrCodeText, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 640
  })

  const order = {
    orderId: process.env.TEST_ORDER_ID || `test-order-${Date.now()}`,
    cart: [
      {
        destinationName: "Test destination",
        dataLabel: "1 GB",
        days: 7,
        quantity: 1,
        unitPrice: 60
      }
    ]
  }

  const fulfillment = {
    installDetails: [
      {
        iccid: process.env.TEST_ICCID || "test-iccid",
        smdpAddress: "test.smdp.example",
        matchingId: "TEST-MATCHING-ID",
        qrCodeText
      }
    ]
  }

  const result = await sendEsimQrEmail({
    to,
    order,
    fulfillment,
    attachments: [
      {
        filename: "test-safarsim-esim.png",
        content: pngBuffer.toString("base64")
      }
    ]
  })

  console.log("Resend email succeeded")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error("Resend email failed")
  console.error({
    name: error.name,
    message: error.response?.data?.message || error.message,
    status: error.response?.status,
    data: error.response?.data
  })
  process.exit(1)
})
