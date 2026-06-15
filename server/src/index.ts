import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { errorHandler } from './middleware/errorHandler'
import authRoutes      from './routes/auth'
import docRoutes       from './routes/docs'
import signatureRoutes from './routes/signatures'

const app = express()
const PORT = process.env.PORT || 5000
const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:5174' , 'http://localhost:5176' ,  // For when you are coding locally
  'https://doc-signature-app.vercel.app', //  main Vercel domain
 
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'DocSign API is running ✅',
    environment: process.env.NODE_ENV,
  })
})

app.use('/api/auth',       authRoutes)
app.use('/api/docs',       docRoutes)
app.use('/api/signatures', signatureRoutes)

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})