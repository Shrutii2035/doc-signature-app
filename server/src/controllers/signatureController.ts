import { Response }                        from 'express'
import { prisma }                          from '../config/prisma'
import { cloudinary }                      from '../config/cloudinary'
import { AuthRequest }                     from '../middleware/auth'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
// ── SAVE SIGNATURE POSITION ───────────────────────────────
// This saves WHERE on the PDF the signature should go
export const saveSignature = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId
    const { documentId, x, y, page, width, height } = req.body

    // Validate all required fields
    if (!documentId || x === undefined || y === undefined || !page) {
      res.status(400).json({
        success: false,
        message: 'documentId, x, y and page are required'
      })
      return
    }

    // Make sure the document exists and belongs to this user
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

    // Save the signature position to database
    const signature = await prisma.signature.create({
      data: {
        documentId,
        userId,
        x:      Number(x),
        y:      Number(y),
        page:   Number(page),
        width:  Number(width)  || 200,
        height: Number(height) || 60,
        status: 'PLACED',      // just placed, not signed yet
      }
    })

    // Add to audit log
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
// Returns all signature positions for a specific document
export const getSignatures = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docId  = String(req.params.docId)
    const userId = req.user!.userId

    // Verify document ownership
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

// ── DELETE A SIGNATURE POSITION ───────────────────────────
// Removes a signature placeholder (before finalizing)
export const deleteSignature = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id     = String(req.params.id)
    const userId = req.user!.userId

    const signature = await prisma.signature.findUnique({
      where: { id }
    })

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
        x: Number(x),
        y: Number(y),
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
import fetch from 'node-fetch'

// ── FINALIZE — embed signatures into PDF ──────────────────
export const finalizeDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docId  = String(req.params.docId)
    const userId = req.user!.userId

    // 1. Get document from database
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

    // 2. Get all signature positions for this document
    const signatures = await prisma.signature.findMany({
      where: { documentId: docId }
    })

    if (signatures.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No signatures placed on this document'
      })
      return
    }

    // 3. Download original PDF from Cloudinary as bytes
    const pdfResponse = await fetch(document.fileUrl)
    const pdfBytes    = await pdfResponse.arrayBuffer()

    // 4. Open PDF with pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const font   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const pages  = pdfDoc.getPages()

    // 5. For each signature — draw it on the correct page at x,y
    for (const sig of signatures) {
      const pageIndex = sig.page - 1 // pdf-lib uses 0-based index
      const page      = pages[pageIndex]

      if (!page) continue

      const { height: pageHeight } = page.getSize()

      // pdf-lib coordinates start from BOTTOM-LEFT
      // but our browser coordinates start from TOP-LEFT
      // so we flip the y coordinate
      const pdfY = pageHeight - sig.y - sig.height

      // Draw signature box border
      page.drawRectangle({
        x:           sig.x,
        y:           pdfY,
        width:       sig.width,
        height:      sig.height,
        borderColor: rgb(0.24, 0.35, 0.82), // indigo color
        borderWidth: 1.5,
      })

      // Draw signature text inside box
      page.drawText('Digitally Signed', {
        x:        sig.x + 10,
        y:        pdfY + sig.height / 2 + 5,
        size:     12,
        font,
        color:    rgb(0.24, 0.35, 0.82),
      })

      // Draw signer name below
      page.drawText(`Signed by: ${userId.slice(0, 8)}...`, {
        x:     sig.x + 10,
        y:     pdfY + 8,
        size:  8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      })

      // Draw timestamp
      const timestamp = new Date().toLocaleDateString('en-IN')
      page.drawText(timestamp, {
        x:     sig.x + sig.width - 60,
        y:     pdfY + 8,
        size:  8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      })

      // Mark signature as signed in database
      await prisma.signature.update({
        where: { id: sig.id },
        data:  { status: 'SIGNED' }
      })
    }

    // 6. Save the modified PDF to bytes
    const signedPdfBytes = await pdfDoc.save()

    // 7. Upload signed PDF to Cloudinary
    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder:        'doc-signature/signed',
            resource_type: 'raw',
            format:        'pdf',
            public_id:     `signed-${docId}-${Date.now()}`,
          },
          (error, result) => {
            if (error || !result) reject(error)
            else resolve(result as { secure_url: string; public_id: string })
          }
        )
        // Convert bytes to buffer and pipe to upload stream
        const buffer = Buffer.from(signedPdfBytes)
        uploadStream.end(buffer)
      }
    )

    // 8. Update document in database with signed PDF URL
    const updatedDoc = await prisma.document.update({
      where: { id: docId },
      data: {
        status:  'SIGNED',
        fileUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      }
    })

    // 9. Add to audit log
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
        document:   updatedDoc,
        signedUrl:  uploadResult.secure_url,
        signatures: signatures.length,
      }
    })
  } catch (error) {
    console.error('Finalize error:', error)
    res.status(500).json({ success: false, message: 'Failed to sign document' })
  }
}