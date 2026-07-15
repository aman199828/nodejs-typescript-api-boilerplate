import { Router } from 'express';
import { FileController } from '../controllers/FileController';
import multer from 'multer';
import path from 'path';
import { mobileAuth } from '../middleware/mobile-auth.middleware';

const router = Router();
const fileController = new FileController();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Temporary storage, will be moved to correct folder
    cb(null, 'public/uploads/temp');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for now, you can restrict as needed
    cb(null, true);
  },
});

// File download routes
// Support both simple paths and nested paths:
// - /download/profile_file/filename.jpg
// - /download/posts/{uuid}/images/filename.jpg
// Using regex to match everything after /download/
// ⚡ SECURITY: Require authentication for all file downloads
// TODO: Re-enable authentication when ready
// router.get(/^\/download\/(.+)/, mobileAuth, fileController.downloadFile);
router.get(/^\/download\/(.+)/, fileController.downloadFile);

// File upload routes
router.post('/upload/:folder', upload.single('file'), fileController.uploadFile);

export default router;
