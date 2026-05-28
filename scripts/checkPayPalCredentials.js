require("dotenv").config()

const axios = require("axios")
const { getPaypalConfig } = require("../services/paypalConfig")

async function main() {
  const paypalConfig = getPaypalConfig()

  const auth = Buffer.from(
    `${paypalConfig.clientId}:${paypalConfig.clientSecret}`
  ).toString("base64")

  const response = await axios.post(
    `${paypalConfig.baseUrl}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  )

  console.log("PayPal credentials are valid")
  console.log(JSON.stringify({
    paypalEnv: paypalConfig.env,
    baseUrl: paypalConfig.baseUrl,
    clientIdPrefix: (paypalConfig.clientId || "").slice(0, 8),
    tokenType: response.data.token_type,
    appId: response.data.app_id || null,
    expiresIn: response.data.expires_in
  }, null, 2))
}

main().catch((error) => {
  console.error("PayPal credential check failed")
  const paypalConfig = getPaypalConfig()
  console.error(JSON.stringify({
    paypalEnv: paypalConfig.env,
    baseUrl: paypalConfig.baseUrl,
    clientIdPrefix: (paypalConfig.clientId || "").slice(0, 8),
    status: error.response?.status,
    data: error.response?.data,
    message: error.message
  }, null, 2))
  process.exit(1)
})
