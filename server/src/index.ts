import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser' 
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import docRoutes from './routes/docs'        
   
const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())    

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'DocSign API is running ✅',
    environment: process.env.NODE_ENV,
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/docs', docRoutes) 
// 404
app.use('/api/auth', authRoutes) 
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// Error handler
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})