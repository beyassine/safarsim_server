const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
    DynamoDBDocumentClient,
    PutCommand,
    UpdateCommand,
    GetCommand,
} = require('@aws-sdk/lib-dynamodb')

const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
})

const ddb = DynamoDBDocumentClient.from(client)

const ORDERS_TABLE = process.env.ORDERS_TABLE

function calculateTotalMad(cart = []) {
    return cart.reduce((sum, item) => {
        return sum + item.unitPrice * item.quantity
    }, 0)
}

function convertMadToUsd(amountMad) {
    const rate = Number(process.env.MAD_TO_USD_RATE || 0.108)
    return Number((amountMad * rate).toFixed(2))
}

function validateCart(cart = []) {
    if (!Array.isArray(cart) || cart.length === 0) {
        throw new Error('Cart is empty')
    }

    for (const item of cart) {
        const quantity = Number(item.quantity)
        const unitPrice = Number(item.unitPrice)

        if (
            !item.destinationName ||
            !item.dataLabel ||
            !item.days ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            !Number.isFinite(unitPrice) ||
            unitPrice <= 0
        ) {
            throw new Error('Invalid cart item')
        }

        item.quantity = quantity
        item.unitPrice = unitPrice
    }
}

async function createPendingOrder({
    cart,
    provider,
    customer = {},
    metadata = {},
}) {
    validateCart(cart)

    const orderId = uuidv4()
    const totalMad = calculateTotalMad(cart)
    const totalUsd = convertMadToUsd(totalMad)
    const now = new Date().toISOString()

    const order = {
        orderId,
        provider, // paypal, stripe, etc.
        status: 'pending',

        cart,

        totalMad,
        totalUsd,
        currencyDisplay: 'MAD',
        currencyCharged: 'USD',

        customer,

        payment: {
            providerOrderId: null,
            providerCaptureId: null,
            providerStatus: null,
        },

        metadata,

        createdAt: now,
        updatedAt: now,
    }

    await ddb.send(
        new PutCommand({
            TableName: ORDERS_TABLE,
            Item: order,
            ConditionExpression: 'attribute_not_exists(orderId)',
        })
    )

    return order
}

async function attachProviderOrderId({
    orderId,
    providerOrderId,
}) {
    const now = new Date().toISOString()

    await ddb.send(
        new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId },
            UpdateExpression: `
        SET payment.providerOrderId = :providerOrderId,
            updatedAt = :updatedAt
      `,
            ExpressionAttributeValues: {
                ':providerOrderId': providerOrderId,
                ':updatedAt': now,
            },
        })
    )
}

async function markOrderPaid({
    orderId,
    providerCaptureId,
    providerStatus,
    payer = null,
    rawPaymentResponse = null,
}) {
    const now = new Date().toISOString()

    await ddb.send(
        new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId },
            UpdateExpression: `
        SET #status = :status,
            payment.providerCaptureId = :providerCaptureId,
            payment.providerStatus = :providerStatus,
            payment.payer = :payer,
            payment.rawPaymentResponse = :rawPaymentResponse,
            paidAt = :paidAt,
            updatedAt = :updatedAt
      `,
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': 'paid',
                ':providerCaptureId': providerCaptureId,
                ':providerStatus': providerStatus,
                ':payer': payer,
                ':rawPaymentResponse': rawPaymentResponse,
                ':paidAt': now,
                ':updatedAt': now,
            },
        })
    )
}

async function markOrderFulfillmentProcessing({ orderId }) {
    const now = new Date().toISOString()

    await ddb.send(
        new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId },
            UpdateExpression: `
        SET fulfillment = :fulfillment,
            updatedAt = :updatedAt
      `,
            ExpressionAttributeValues: {
                ':fulfillment': {
                    provider: 'esimgo',
                    status: 'processing',
                    startedAt: now,
                },
                ':updatedAt': now,
            },
        })
    )
}

async function markOrderFulfilled({
    orderId,
    fulfillment,
}) {
    const now = new Date().toISOString()

    await ddb.send(
        new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId },
            UpdateExpression: `
        SET fulfillment = :fulfillment,
            fulfilledAt = :fulfilledAt,
            updatedAt = :updatedAt
      `,
            ExpressionAttributeValues: {
                ':fulfillment': {
                    ...fulfillment,
                    completedAt: now,
                },
                ':fulfilledAt': now,
                ':updatedAt': now,
            },
        })
    )
}

async function markOrderFulfillmentFailed({
    orderId,
    errorMessage,
}) {
    const now = new Date().toISOString()

    await ddb.send(
        new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId },
            UpdateExpression: `
        SET fulfillment = :fulfillment,
            updatedAt = :updatedAt
      `,
            ExpressionAttributeValues: {
                ':fulfillment': {
                    provider: 'esimgo',
                    status: 'failed',
                    errorMessage: errorMessage || 'eSIM Go fulfillment failed',
                    failedAt: now,
                },
                ':updatedAt': now,
            },
        })
    )
}

async function markOrderFailed({
    orderId,
    providerStatus,
    errorMessage,
}) {
    const now = new Date().toISOString()

    await ddb.send(
        new UpdateCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId },
            UpdateExpression: `
        SET #status = :status,
            payment.providerStatus = :providerStatus,
            payment.errorMessage = :errorMessage,
            updatedAt = :updatedAt
      `,
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': 'failed',
                ':providerStatus': providerStatus || 'failed',
                ':errorMessage': errorMessage || 'Payment failed',
                ':updatedAt': now,
            },
        })
    )
}

async function getOrderById(orderId) {
    const response = await ddb.send(
        new GetCommand({
            TableName: ORDERS_TABLE,
            Key: { orderId },
        })
    )

    return response.Item || null
}
async function createPaidOrder({
    cart,
    provider,
    providerOrderId,
    providerCaptureId,
    providerStatus,
    payer = null,
    rawPaymentResponse = null,
    customer = {},
    metadata = {},
}) {
    validateCart(cart)

    const orderId = uuidv4()
    const totalMad = calculateTotalMad(cart)
    const totalUsd = convertMadToUsd(totalMad)
    const now = new Date().toISOString()

    const order = {
        orderId,
        provider,
        status: 'paid',

        cart,

        totalMad,
        totalUsd,
        currencyDisplay: 'MAD',
        currencyCharged: 'USD',

        customer,

        payment: {
            providerOrderId,
            providerCaptureId,
            providerStatus,
            payer,
            rawPaymentResponse,
        },

        metadata,

        paidAt: now,
        createdAt: now,
        updatedAt: now,
    }

    await ddb.send(
        new PutCommand({
            TableName: ORDERS_TABLE,
            Item: order,
            ConditionExpression: 'attribute_not_exists(orderId)',
        })
    )

    return order
}

module.exports = {
    calculateTotalMad,
    convertMadToUsd,
    validateCart,
    createPendingOrder,
    attachProviderOrderId,
    markOrderPaid,
    markOrderFulfillmentProcessing,
    markOrderFulfilled,
    markOrderFulfillmentFailed,
    markOrderFailed,
    getOrderById,
    createPaidOrder,
}
