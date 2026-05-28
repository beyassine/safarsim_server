const express = require('express')
const cors = require('cors')
require('dotenv').config()

const paypalRoutes = require('./routes/paypal')

const app = express()

app.use(cors({
  origin: [
    'http://localhost:8080',
    'https://www.safarsim.net',
    'https://safarsim.net',
  ],
  credentials: true,
}))

app.use(express.json())

app.use('/api/paypal', paypalRoutes)

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})