require("dotenv").config()

const { getOrderById, markOrderFulfilled } = require("../services/orderService")
const { sendEsimQrEmail } = require("../services/emailService")
const { buildQrArtifacts } = require("../services/qrCodeService")

async function main() {
  const orderId = process.env.TEST_ORDER_ID || process.argv[2]

  if (!orderId) {
    throw new Error("Provide an order id: npm run send:order-email -- <orderId>")
  }

  const order = await getOrderById(orderId)

  if (!order) {
    throw new Error(`Order not found: ${orderId}`)
  }

  const to = process.env.TEST_EMAIL_TO || order.customer?.email

  if (!to) {
    throw new Error("Order has no customer.email. Set TEST_EMAIL_TO to override.")
  }

  const fulfillment = order.fulfillment || {}
  const installDetails = fulfillment.installDetails || []

  if (!installDetails.length) {
    throw new Error("Order has no fulfillment.installDetails. This script will not call eSIM Go.")
  }

  const { attachments, updatedInstallDetails } = await buildQrArtifacts({
    orderId,
    installDetails
  })

  const updatedFulfillment = {
    ...fulfillment,
    provider: fulfillment.provider || "esimgo",
    status: fulfillment.status || "fulfilled",
    installDetails: updatedInstallDetails
  }

  try {
    const emailResponse = await sendEsimQrEmail({
      to,
      order,
      fulfillment: updatedFulfillment,
      attachments
    })

    updatedFulfillment.email = {
      provider: "resend",
      status: "sent",
      to,
      providerEmailId: emailResponse.id || null
    }
  } catch (error) {
    updatedFulfillment.email = {
      provider: "resend",
      status: "failed",
      to,
      errorMessage: error.response?.data?.message || error.message
    }

    await markOrderFulfilled({
      orderId,
      fulfillment: updatedFulfillment
    })

    throw error
  }

  await markOrderFulfilled({
    orderId,
    fulfillment: updatedFulfillment
  })

  console.log("Order QR email succeeded")
  console.log(JSON.stringify({
    orderId,
    to,
    qrImages: updatedInstallDetails.map((detail) => detail.qrImage),
    email: updatedFulfillment.email
  }, null, 2))
}

main().catch((error) => {
  console.error("Order QR email failed")
  console.error({
    name: error.name,
    message: error.response?.data?.message || error.message,
    status: error.response?.status,
    data: error.response?.data
  })
  process.exit(1)
})
