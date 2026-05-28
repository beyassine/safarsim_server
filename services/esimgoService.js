const axios = require("axios")

const ESIMGO_API_URL = process.env.ESIMGO_API_URL || "https://api.esim-go.com/v2.5"

const esimgo = axios.create({
  baseURL: ESIMGO_API_URL,
  headers: {
    "X-API-Key": process.env.ESIMGO_API_KEY,
    "Content-Type": "application/json"
  }
})

function getBundleName(item) {
  return item.esimGoBundleName || item.bundleName
}

function buildOrderItems(cart = []) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error("Cart is empty")
  }

  return cart.map((item) => {
    const bundleName = getBundleName(item)

    if (!bundleName) {
      throw new Error(
        `Missing eSIM Go bundle name for ${item.destinationName || "cart item"} ${item.planKey || ""}`.trim()
      )
    }

    return {
      type: "bundle",
      quantity: Number(item.quantity || 1),
      item: bundleName,
      allowReassign: false
    }
  })
}

function buildQrCodeText({ smdpAddress, matchingId }) {
  if (!smdpAddress || !matchingId) return null

  return `LPA:1$${smdpAddress}$${matchingId}`
}

function extractInstallDetails(orderResponse) {
  return (orderResponse.order || []).flatMap((orderItem) => {
    return (orderItem.esims || []).map((esim) => ({
      bundleName: orderItem.item,
      iccid: esim.iccid,
      matchingId: esim.matchingId,
      smdpAddress: esim.smdpAddress,
      qrCodeText: buildQrCodeText(esim)
    }))
  })
}

async function createEsimGoOrder(cart) {
  const payload = {
    type: "transaction",
    assign: true,
    order: buildOrderItems(cart)
  }

  const { data } = await esimgo.post("/orders", payload)
  return data
}

async function getInstallDetails(orderReference) {
  const { data } = await esimgo.get("/esims/assignments", {
    params: {
      reference: orderReference,
      additionalFields: "appleInstallUrl"
    },
    headers: {
      Accept: "application/json"
    }
  })

  return data
}

async function getQrCodesZip(orderReference) {
  const response = await esimgo.get("/esims/assignments", {
    params: {
      reference: orderReference
    },
    responseType: "arraybuffer",
    headers: {
      Accept: "application/zip"
    }
  })

  return response.data
}

async function getCatalogue() {
  const { data } = await esimgo.get("/catalogue", {
    params: {
      perPage: 100
    }
  })

  return data
}

module.exports = {
  buildOrderItems,
  extractInstallDetails,
  createEsimGoOrder,
  getInstallDetails,
  getQrCodesZip,
  getCatalogue
}
