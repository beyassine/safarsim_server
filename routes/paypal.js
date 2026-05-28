const express = require('express')
const axios = require('axios')

const {
  createPendingOrder,
  attachProviderOrderId,
  markOrderPaid,
  markOrderFailed,
  createPaidOrder,
  validateCart,
} = require('../services/orderService')
const { fulfillOrderWithEsimGo } = require('../services/fulfillmentService')
const { getPaypalConfig } = require('../services/paypalConfig')

const router = express.Router()

function getPaypalErrorDetails(error) {
  return {
    message: error.message,
    paypal: error.response?.data,
  }
}

function validateCustomer(customer = {}) {
  const email = customer.email?.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid customer email is required')
  }

  return {
    ...customer,
    email,
  }
}

async function getAccessToken() {
  const paypalConfig = getPaypalConfig()

  const auth = Buffer.from(
    `${paypalConfig.clientId}:${paypalConfig.clientSecret}`
  ).toString('base64')

  const response = await axios.post(
    `${paypalConfig.baseUrl}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )

  return response.data.access_token
}

router.get('/config', (req, res) => {
  const paypalConfig = getPaypalConfig()

  if (!paypalConfig.clientId) {
    return res.status(500).json({
      error: 'PayPal client id is not configured',
    })
  }

  return res.json({
    env: paypalConfig.env,
    clientId: paypalConfig.clientId,
    currency: 'USD',
    intent: 'capture',
  })
})

router.post('/create-order', async (req, res) => {
  let pendingOrder = null

  try {
    const { cart } = req.body
    const customer = validateCustomer(req.body.customer)

    pendingOrder = await createPendingOrder({
      cart,
      provider: 'paypal',
      customer,
      metadata: {
        source: 'cart_checkout',
      },
    })

    const accessToken = await getAccessToken()

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: 'Commande Safar SIM',
          amount: {
            currency_code: 'USD',
            value: pendingOrder.totalUsd.toFixed(2),
          },
        },
      ],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        brand_name: 'Safar SIM',
      },
    }

    const paypalConfig = getPaypalConfig()
    const paypalResponse = await axios.post(
      `${paypalConfig.baseUrl}/v2/checkout/orders`,
      orderPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    await attachProviderOrderId({
      orderId: pendingOrder.orderId,
      providerOrderId: paypalResponse.data.id,
    })

    return res.json({
      id: paypalResponse.data.id,
      orderId: pendingOrder.orderId,
      totalMad: pendingOrder.totalMad,
      totalUsd: pendingOrder.totalUsd,
      currency: 'USD',
    })
  } catch (error) {
    if (pendingOrder) {
      try {
        await markOrderFailed({
          orderId: pendingOrder.orderId,
          providerStatus: 'create_failed',
          errorMessage: error.message,
        })
      } catch (markFailedError) {
        console.error('Unable to mark pending order as failed:', {
          name: markFailedError.name,
          message: markFailedError.message,
          orderId: pendingOrder.orderId,
        })
      }
    }

    console.error('PayPal create-order error:', {
      name: error.name,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    })

    if (!error.response) {
      return res.status(400).json({
        error: error.message,
      })
    }

    return res.status(500).json({
      error: 'Unable to create PayPal order',
      details: getPaypalErrorDetails(error),
    })
  }
})
router.post('/capture-order', async (req, res) => {
  try {
    const { orderID, localOrderId, cart } = req.body
    const customer = req.body.customer ? validateCustomer(req.body.customer) : {}

    if (!orderID) {
      return res.status(400).json({
        error: 'orderID is required',
      })
    }

    if (!localOrderId) {
      validateCart(cart)
    }

    const accessToken = await getAccessToken()

    const paypalConfig = getPaypalConfig()
    const paypalCaptureResponse = await axios.post(
      `${paypalConfig.baseUrl}/v2/checkout/orders/${orderID}/capture`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const paypalOrder = paypalCaptureResponse.data
    const purchaseUnit = paypalOrder.purchase_units?.[0]
    const capture = purchaseUnit?.payments?.captures?.[0]

    if (paypalOrder.status !== 'COMPLETED') {
      if (localOrderId) {
        await markOrderFailed({
          orderId: localOrderId,
          providerStatus: paypalOrder.status,
          errorMessage: 'PayPal order was not completed',
        })
      }

      return res.status(400).json({
        success: false,
        status: paypalOrder.status,
      })
    }

    let savedOrder
    let fulfillment = null

    try {
      if (localOrderId) {
        await markOrderPaid({
          orderId: localOrderId,
          providerCaptureId: capture?.id || null,
          providerStatus: paypalOrder.status,
          payer: paypalOrder.payer || null,
          rawPaymentResponse: paypalOrder,
        })

        savedOrder = { orderId: localOrderId }
      } else {
        savedOrder = await createPaidOrder({
          cart,
          provider: 'paypal',
          providerOrderId: paypalOrder.id,
          providerCaptureId: capture?.id || null,
          providerStatus: paypalOrder.status,
          payer: paypalOrder.payer || null,
          rawPaymentResponse: paypalOrder,
          customer,
          metadata: {
            source: 'cart_checkout',
          },
        })
      }

      try {
        fulfillment = await fulfillOrderWithEsimGo(savedOrder.orderId)
      } catch (fulfillmentError) {
        console.error('eSIM Go fulfillment error after PayPal capture:', {
          name: fulfillmentError.name,
          message: fulfillmentError.message,
          orderId: savedOrder.orderId,
          paypalOrderId: paypalOrder.id,
        })

        return res.status(500).json({
          error: 'Payment captured, but eSIM order could not be fulfilled',
          details: {
            message: fulfillmentError.message,
            orderId: savedOrder.orderId,
            paypalOrderId: paypalOrder.id,
            captureID: capture?.id || null,
          },
        })
      }
    } catch (saveError) {
      console.error('Order save error after PayPal capture:', {
        name: saveError.name,
        message: saveError.message,
        paypalOrderId: paypalOrder.id,
        captureID: capture?.id || null,
      })

      return res.status(500).json({
        error: 'Payment captured, but order could not be saved',
        details: {
          message: saveError.message,
          paypalOrderId: paypalOrder.id,
          captureID: capture?.id || null,
        },
      })
    }

    return res.json({
      success: true,
      orderId: savedOrder.orderId,
      paypalOrderId: paypalOrder.id,
      captureID: capture?.id || null,
      status: paypalOrder.status,
      fulfillment,
    })
  } catch (error) {
    console.error('PayPal capture-order error:', {
      name: error.name,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    })

    return res.status(500).json({
      error: 'Unable to capture PayPal order',
      details: getPaypalErrorDetails(error),
    })
  }
})

module.exports = router
