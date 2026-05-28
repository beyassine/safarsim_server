const QRCode = require("qrcode")
const { uploadQrPng } = require("./s3Service")

function buildQrCodeText(detail) {
  if (detail.qrCodeText) return detail.qrCodeText
  if (!detail.smdpAddress || !detail.matchingId) return null

  return `LPA:1$${detail.smdpAddress}$${detail.matchingId}`
}

async function buildQrArtifacts({
  orderId,
  installDetails
}) {
  const attachments = []
  const updatedInstallDetails = []

  for (const [index, detail] of installDetails.entries()) {
    const qrCodeText = buildQrCodeText(detail)

    if (!qrCodeText) {
      throw new Error(`Install detail ${index + 1} is missing qrCodeText or SMDP/matchingId values`)
    }

    const pngBuffer = await QRCode.toBuffer(qrCodeText, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 640
    })

    const qrImage = await uploadQrPng({
      orderId,
      iccid: detail.iccid || `esim-${index + 1}`,
      pngBuffer
    })

    updatedInstallDetails.push({
      ...detail,
      qrCodeText,
      qrImage
    })

    attachments.push({
      filename: `safarsim-esim-${detail.iccid || index + 1}.png`,
      content: pngBuffer.toString("base64")
    })
  }

  return {
    attachments,
    updatedInstallDetails
  }
}

module.exports = {
  buildQrCodeText,
  buildQrArtifacts
}
