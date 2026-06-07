import { Router } from 'express'
import {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
} from '../controllers/docController'
import { protect } from '../middleware/auth'
import { upload } from '../config/cloudinary'

const router = Router()

// All routes require login
router.use(protect)

router.post('/upload', upload.single('document'), uploadDocument)
router.get('/',        getDocuments)
router.get('/:id',     getDocument)
router.delete('/:id',  deleteDocument)

export default router