import { Response } from 'express'
import { prisma } from '../config/prisma'
import { cloudinary } from '../config/cloudinary'
import { AuthRequest } from '../middleware/auth'

// ── UPLOAD DOCUMENT ───────────────────────────────────────
export const uploadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if file was actually uploaded
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No PDF file provided' })
      return
    }

    const userId = req.user!.userId

    // Cloudinary gives us these after upload
    const fileUrl  = req.file.path        // the Cloudinary URL
    const publicId = req.file.filename    // needed to delete file later

    // Save document metadata to database
    const document = await prisma.document.create({
      data: {
        filename:     publicId,
        originalName: req.file.originalname,
        fileUrl,
        publicId,
        size:         req.file.size,
        ownerId:      userId,
      },
    })

    // Log this action in audit trail
    await prisma.auditLog.create({
      data: {
        documentId: document.id,
        userId,
        action:     'DOCUMENT_UPLOADED',
        ipAddress:  req.ip || '',
        userAgent:  req.headers['user-agent'] || '',
      },
    })

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: { document },
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ success: false, message: 'Upload failed' })
  }
}

// ── GET ALL DOCUMENTS ─────────────────────────────────────
export const getDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId    // get user from JWT token, not from URL params

    // Only return documents owned by the logged in user
    const documents = await prisma.document.findMany({
      where:   { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      success: true,
      data: { documents, count: documents.length },
    })
  } catch (error) {
    console.error('Get documents error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── GET SINGLE DOCUMENT ───────────────────────────────────
export const getDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const userId   = req.user!.userId

    const document = await prisma.document.findUnique({
      where: { id },
    })

    // Check document exists
    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    // Check the document belongs to the logged in user
    if (document.ownerId !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' })
      return
    }

    // Log that the document was viewed
    await prisma.auditLog.create({
      data: {
        documentId: document.id,
        userId,
        action:    'DOCUMENT_VIEWED',
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      },
    })

    res.json({ success: true, data: { document } })
  } catch (error) {
    console.error('Get document error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── DELETE DOCUMENT ───────────────────────────────────────
export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const userId = req.user!.userId

    const document = await prisma.document.findUnique({ where: { id } })

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    if (document.ownerId !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' })
      return
    }

    // Delete file from Cloudinary first
    await cloudinary.uploader.destroy(document.publicId, {
      resource_type: 'raw',
    })

    // Then delete from database
    await prisma.document.delete({ where: { id } })

    res.json({ success: true, message: 'Document deleted successfully' })
  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}