import { Response }                        from 'express'
import { prisma }                          from '../config/prisma'
import { cloudinary }                      from '../config/cloudinary'
import { AuthRequest }                     from '../middleware/auth'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fetch                               from 'node-fetch'

// ── SAVE SIGNATURE POSITION ───
export const saveSignature = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const { documentId, x, y, page, width, height } = req.body

    if (!documentId || x === undefined || y === undefined || !page) {
      res.status(400).json({
        success: false,
        message: 'documentId, x, y and page are required'
      })
      return
    } 

    const document = await prisma.document.findUnique({
      where: { id: documentId }
    })

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    if (document.ownerId !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' })
      return
    }

    const signature = await prisma.signature.create({
      data: {
        documentId,
        userId,
        x:      Number(x),
        y:      Number(y),
        page:   Number(page),
        width:  Number(width)  || 200,
        height: Number(height) || 60,
        status: 'PLACED',
      }
    })

    await prisma.auditLog.create({
      data: {
        documentId,
        userId,
        action:    'SIGNATURE_PLACED',
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        metadata:  { x, y, page },
      }
    })

    res.status(201).json({
      success: true,
      message: 'Signature position saved',
      data: { signature }
    })
  } catch (error) {
    console.error('Save signature error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── GET SIGNATURES FOR A DOCUMENT ────────────────────────
export const getSignatures = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docId  = String(req.params.docId)
    const userId = req.user!.userId

    const document = await prisma.document.findUnique({
      where: { id: docId }
    })

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    if (document.ownerId !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' })
      return
    }

    const signatures = await prisma.signature.findMany({
      where:   { documentId: docId },
      orderBy: { createdAt: 'asc' },
    })

    res.json({
      success: true,
      data: { signatures, count: signatures.length }
    })
  } catch (error) {
    console.error('Get signatures error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── UPDATE SIGNATURE POSITION (after drag) ────────────────
export const updateSignature = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id     = String(req.params.id)
    const userId = req.user!.userId
    const { x, y, page } = req.body

    const signature = await prisma.signature.findUnique({ where: { id } })

    if (!signature) {
      res.status(404).json({ success: false, message: 'Signature not found' })
      return
    }

    if (signature.userId !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' })
      return
    }

    const updated = await prisma.signature.update({
      where: { id },
      data: {
        x:    Number(x),
        y:    Number(y),
        page: Number(page),
      }
    })

    res.json({
      success: true,
      message: 'Signature position updated',
      data: { signature: updated }
    })
  } catch (error) {
    console.error('Update signature error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── DELETE A SIGNATURE POSITION ───────────────────────────
export const deleteSignature = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id     = String(req.params.id)
    const userId = req.user!.userId

    const signature = await prisma.signature.findUnique({ where: { id } })

    if (!signature) {
      res.status(404).json({ success: false, message: 'Signature not found' })
      return
    }

    if (signature.userId !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' })
      return
    }

    await prisma.signature.delete({ where: { id } })

    res.json({ success: true, message: 'Signature removed' })
  } catch (error) {
    console.error('Delete signature error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// ── FINALIZE — embed signatures into PDF ──────────────────
export const finalizeDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docId  = String(req.params.docId)
    const userId = req.user!.userId

    const document = await prisma.document.findUnique({ where: { id: docId } })
    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' })
      return
    }

    if (document.ownerId !== userId) {
      res.status(403).json({ success: false, message: 'Not authorized' })
      return
    }

    const signatures = await prisma.signature.findMany({ where: { documentId: docId } })
    if (signatures.length === 0) {
      res.status(400).json({ success: false, message: 'No signatures placed' })
      return
    }

    // Download original PDF from Cloudinary 
    const pdfResponse = await fetch(document.fileUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    if (!pdfResponse.ok) throw new Error("Cloudinary fetch failed");
    const pdfBytes = await pdfResponse.arrayBuffer()

    const pdfDoc = await PDFDocument.load(pdfBytes)
    const font   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const pages  = pdfDoc.getPages()

    // 5. Draw each signature with precise scale math
    for (const sig of signatures) {
      const pageIndex = sig.page - 1
      const page      = pages[pageIndex]
      if (!page) continue

      // Get the actual internal dimensions of the PDF page
      const { width: pageWidth, height: pageHeight } = page.getSize()
      
      // Calculate the difference ratio (Frontend rendered at 750px width)
      const scaleRatio = pageWidth / 750

      // Scale all coordinates and dimensions down (or up) to match the PDF
      const actualX      = sig.x * scaleRatio
      const actualY      = sig.y * scaleRatio
      const actualWidth  = (sig.width || 200) * scaleRatio
      const actualHeight = (sig.height || 60) * scaleRatio

      // PDF Y-axis starts from the BOTTOM, so we subtract from pageHeight
      const pdfY = pageHeight - actualY - actualHeight

      // Draw signature border box scaled correctly
      page.drawRectangle({
        x:           actualX,
        y:           pdfY,
        width:       actualWidth,
        height:      actualHeight,
        borderColor: rgb(0.24, 0.35, 0.82),
        borderWidth: 1.5 * scaleRatio, // Scale the border thickness too
      })

      // Draw "Digitally Signed" text
      page.drawText('Digitally Signed', {
        x:     actualX + (10 * scaleRatio),
        y:     pdfY + (actualHeight / 2) + (5 * scaleRatio),
        size:  12 * scaleRatio, // Scale the font size
        font,
        color: rgb(0.24, 0.35, 0.82),
      })

      // Draw signer ID
      page.drawText(`Signer: ${userId.slice(0, 8)}...`, {
        x:     actualX + (10 * scaleRatio),
        y:     pdfY + (8 * scaleRatio),
        size:  8 * scaleRatio,
        font,
        color: rgb(0.5, 0.5, 0.5),
      })

      // Draw timestamp
      const timestamp = new Date().toLocaleDateString('en-IN')
      page.drawText(timestamp, {
        x:     actualX + actualWidth - (65 * scaleRatio),
        y:     pdfY + (8 * scaleRatio),
        size:  8 * scaleRatio,
        font,
        color: rgb(0.5, 0.5, 0.5),
      })

      await prisma.signature.update({
        where: { id: sig.id },
        data:  { status: 'SIGNED' }
      })
    }

    const signedPdfBytes = await pdfDoc.save()

    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder:        'doc-signature/signed',
            resource_type: 'raw',
            format:        'pdf',
            public_id:     `signed-${docId}-${Date.now()}`,
            access_mode:   'public',
          },
          (error, result) => {
            if (error || !result) reject(error)
            else resolve(result as { secure_url: string; public_id: string })
          }
        )
        uploadStream.end(Buffer.from(signedPdfBytes))
      }
    )

    const updatedDoc = await prisma.document.update({
      where: { id: docId },
      data: {
        status:   'SIGNED',
        fileUrl:  uploadResult.secure_url,
        publicId: uploadResult.public_id,
      }
    })

    await prisma.auditLog.create({
      data: {
        documentId: docId,
        userId,
        action:    'DOCUMENT_SIGNED',
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        metadata:  { signaturesCount: signatures.length }
      }
    })

    res.json({
      success: true,
      message: 'Document signed successfully',
      data: {
        document:        updatedDoc,
        signedUrl:       uploadResult.secure_url,
        signaturesCount: signatures.length,
      }
    })
  } catch (error) {
    console.error('Finalize error:', error)
    res.status(500).json({ success: false, message: 'Failed to sign document' })
  }
}