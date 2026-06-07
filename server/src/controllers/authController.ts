import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt'

// ── REGISTER ─────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body

    // Check all fields are provided
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'All fields are required' })
      return
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      res.status(400).json({ success: false, message: 'Email already registered' })
      return
    }

    // Hash the password — never store plain text passwords
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user in database
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    })

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email })
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email })

    // Send refresh token as httpOnly cookie (can't be stolen by JS)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    })

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── LOGIN ─────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' })
      return
    }

    // Find user — include password field (it's hidden by default)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password' })
      return
    }

    // Compare entered password with hashed password in DB
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: 'Invalid email or password' })
      return
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email })
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email })

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── REFRESH TOKEN ─────────────────────────────────────────
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken

    if (!token) {
      res.status(401).json({ success: false, message: 'No refresh token' })
      return
    }

    // Verify the refresh token
    const decoded = verifyRefreshToken(token)

    // Issue a new access token
    const accessToken = generateAccessToken({
      userId: decoded.userId,
      email: decoded.email,
    })

    res.json({ success: true, data: { accessToken } })
  } catch {
    res.status(401).json({ success: false, message: 'Invalid refresh token' })
  }
}

// ── LOGOUT ────────────────────────────────────────────────
export const logout = (_req: Request, res: Response): void => {
  // Clear the refresh token cookie
  res.clearCookie('refreshToken')
  res.json({ success: true, message: 'Logged out successfully' })
}