import { Router } from 'express'
import {
  saveSignature,
  getSignatures,
  updateSignature,
  deleteSignature,
  finalizeDocument,
} from '../controllers/signatureController'
import { protect } from '../middleware/auth'

const router = Router()

router.use(protect)

router.post('/',                saveSignature)
router.get('/:docId',           getSignatures)
router.patch('/:id',            updateSignature)
router.delete('/:id',           deleteSignature)
router.post('/finalize/:docId', finalizeDocument)  // ← NEW

export default router