const {
  createEsimGoOrder,
  extractInstallDetails,
  getInstallDetails
} = require("./esimgoService")
const { buildQrArtifacts } = require("./qrCodeService")
const { sendEsimQrEmail } = require("./emailService")
const {
  getOrderById,
  markOrderFulfillmentProcessing,
  markOrderFulfilled,
  markOrderFulfillmentFailed
} = require("./orderService")

async function fulfillOrderWithEsimGo(orderId) {
  const order = await getOrderById(orderId)
  if (!order) {
    throw new Error("Order not found")
  }

  if (order.status !== "paid") {
    throw new Error("Order must be paid before fulfillment")
  }

  if (order.fulfillment?.status === "fulfilled") {
    return order.fulfillment
  }

  await markOrderFulfillmentProcessing({ orderId })

  try {
    const esimGoOrder = await createEsimGoOrder(order.cart)
    const orderReference = esimGoOrder.orderReference

    let installDetails = extractInstallDetails(esimGoOrder)

    if (orderReference && installDetails.length === 0) {
      const details = await getInstallDetails(orderReference)
      installDetails = Array.isArray(details) ? details : [details]
    }

    if (!installDetails.length) {
      throw new Error("eSIM Go did not return install details")
    }

    const {
      attachments: emailAttachments,
      updatedInstallDetails: installDetailsWithQrImages
    } = await buildQrArtifacts({
      orderId,
      installDetails
    })

    const fulfillment = {
      provider: "esimgo",
      status: "fulfilled",
      providerOrderReference: orderReference || null,
      providerStatus: esimGoOrder.status || null,
      providerStatusMessage: esimGoOrder.statusMessage || null,
      assigned: Boolean(esimGoOrder.assigned),
      installDetails: installDetailsWithQrImages,
      rawOrderResponse: esimGoOrder
    }

    if (order.customer?.email) {
      try {
        const emailResponse = await sendEsimQrEmail({
          to: order.customer.email,
          order,
          fulfillment,
          attachments: emailAttachments
        })

        fulfillment.email = {
          provider: "resend",
          status: "sent",
          to: order.customer.email,
          providerEmailId: emailResponse.id || null
        }
      } catch (emailError) {
        console.error("Unable to send eSIM email:", {
          name: emailError.name,
          message: emailError.message,
          orderId,
          to: order.customer.email
        })

        fulfillment.email = {
          provider: "resend",
          status: "failed",
          to: order.customer.email,
          errorMessage: emailError.message
        }
      }
    }

    await markOrderFulfilled({
      orderId,
      fulfillment
    })

    return fulfillment
  } catch (error) {
    await markOrderFulfillmentFailed({
      orderId,
      errorMessage: error.message
    })

    throw error
  }
}

module.exports = {
  fulfillOrderWithEsimGo
}
