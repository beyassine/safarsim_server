const axios = require("axios")

const RESEND_API_URL = "https://api.resend.com/emails"

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || "Safar SIM <onboarding@resend.dev>"
}

function buildOrderItemsHtml(order) {
  return (order.cart || [])
    .map((item) => {
      const total = Number(item.unitPrice) * Number(item.quantity)
      return `<li>${item.destinationName} - ${item.dataLabel} - ${item.days} jours - Quantite: ${item.quantity} - Total: ${total} DH</li>`
    })
    .join("")
}

async function sendEsimQrEmail({
  to,
  order,
  fulfillment,
  attachments = []
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required")
  }

  if (!to) {
    throw new Error("Customer email is required")
  }

  const installDetails = fulfillment.installDetails || []
  const installBlocks = installDetails
    .map((detail) => {
      return `
        <div>
          <p><strong>ICCID:</strong> ${detail.iccid || ""}</p>
          <p><strong>SMDP+:</strong> ${detail.smdpAddress || ""}</p>
          <p><strong>Code d'activation:</strong> ${detail.matchingId || ""}</p>
          ${detail.qrImage?.url ? `<p><a href="${detail.qrImage.url}">Telecharger le QR code</a></p>` : ""}
        </div>
      `
    })
    .join("")

  const payload = {
    from: getFromAddress(),
    to: [to],
    subject: `Votre eSIM Safar SIM - Commande ${order.orderId}`,
    html: `
      <h1>Votre eSIM est prete</h1>
      <p>Merci pour votre commande. Vous trouverez votre QR code eSIM en piece jointe.</p>
      <h2>Commande</h2>
      <ul>${buildOrderItemsHtml(order)}</ul>
      <h2>Installation</h2>
      ${installBlocks}
      <p>Scannez le QR code depuis les reglages eSIM de votre telephone.</p>
    `,
    attachments
  }

  const { data } = await axios.post(RESEND_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    }
  })

  return data
}

module.exports = {
  sendEsimQrEmail
}
