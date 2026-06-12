import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import multer from 'multer'
import 'dotenv/config'

// Connect to your Cloudinary account
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

// Tell Cloudinary where and how to store uploaded files
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:        'doc-signature/documents',
    allowed_formats: ['pdf'],
    resource_type: 'raw',
    access_mode:   'public',      
  } as object,
})

// Only allow PDF files — extra safety check
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true)
  } else {
    cb(new Error('Only PDF files are allowed'))
  }
}

// Final multer upload instance
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
})

export { cloudinary }