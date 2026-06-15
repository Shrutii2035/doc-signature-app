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
// Define your fixed primary domains
const primaryOrigins = [
  'http://localhost:5173', 'http://localhost:5174',
  'https://doc-signature-app.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    // 1. Allow server-to-server or tools like Postman (where origin is undefined)
    if (!origin) return callback(null, true);

    // 2. Allow our main domains (localhost and production)
    if (primaryOrigins.includes(origin)) {
      return callback(null, true);
    }

    // 3. AUTOMATIC MATCH: Allow any Vercel preview domain that belongs to your project
    // This looks for domains ending in '.vercel.app' that contain your project identity
    if (origin.endsWith('.vercel.app') && origin.includes('doc-signature')) {
      return callback(null, true);
    }

    // Block anything else for security
    return callback(new Error('Not allowed by CORS'));
  },
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