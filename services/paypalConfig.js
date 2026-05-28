const PAYPAL_ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"

function getPaypalBaseUrl() {
  return PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com"
}

function getPaypalClientId() {
  return PAYPAL_ENV === "live"
    ? process.env.PAYPAL_CLIENT_ID_LIVE || process.env.PAYPAL_CLIENT_ID
    : process.env.PAYPAL_CLIENT_ID_SANDBOX || process.env.PAYPAL_CLIENT_ID
}

function getPaypalClientSecret() {
  return PAYPAL_ENV === "live"
    ? process.env.PAYPAL_CLIENT_SECRET_LIVE || process.env.PAYPAL_CLIENT_SECRET
    : process.env.PAYPAL_CLIENT_SECRET_SANDBOX || process.env.PAYPAL_CLIENT_SECRET
}

function getPaypalConfig() {
  return {
    env: PAYPAL_ENV,
    baseUrl: getPaypalBaseUrl(),
    clientId: getPaypalClientId(),
    clientSecret: getPaypalClientSecret()
  }
}

module.exports = {
  getPaypalConfig
}
