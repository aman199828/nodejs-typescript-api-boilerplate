import { Router } from 'express';
import { auth, admin } from '../middleware/auth.middleware';
import { AdminAuthController } from '../controllers/admin/AdminAuthController';
import {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  toggleUserStatus,
  setUserInactive,
  setUserActive,
  setUserDeleted,
  toggleUserState,
  getUserStatusOptions,
} from '../controllers/admin/user.controller';
import {
  adminLoginValidation,
  adminUpdateProfileValidation,
  adminUpdatePasswordValidation,
} from '../validations/admin.validations';
import {
  validateSetUserInactive,
  validateSetUserActive,
  validateSetUserDeleted,
  validateUpdateUser,
  validateToggleUserState,
} from '../validations/userStatus.validations';
import multer from 'multer';
import path from 'path';
import {
  listPagesAdmin,
  createPageAdmin,
  getPageAdmin,
  getPageByTypeIdAdmin,
  updatePageAdmin,
  deletePageAdmin,
} from '../controllers/admin/page.controller';
import { prisma } from '../lib/prisma';

const router = Router();
const adminAuthController = new AdminAuthController(prisma);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine destination based on field name
    if (file.fieldname === 'profileFile') {
      cb(null, 'public/uploads/profile_file');
    } else if (file.fieldname === 'coverImage') {
      cb(null, 'public/uploads/cover_images');
    } else {
      cb(null, 'public/uploads/temp');
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const prefix = file.fieldname === 'profileFile' ? 'profile-' : 'cover-';
    cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 2, // Maximum 2 files (profileFile and coverImage)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF)'));
    }
  },
});

// Public admin routes (no auth required)
router.post('/login', adminLoginValidation, adminAuthController.login);

// Protected admin routes (auth required)
router.use(auth);
router.use(admin);

router.post('/logout', adminAuthController.logout);
router.get('/profile', adminAuthController.getProfile);
router.put(
  '/update-profile',
  upload.single('profileFile'),
  adminUpdateProfileValidation,
  adminAuthController.updateProfile
);
router.put('/update-password', adminUpdatePasswordValidation, adminAuthController.updatePassword);

// User management routes
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put(
  '/users/:id',
  upload.fields([
    { name: 'profileFile', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
  ]),
  validateUpdateUser,
  updateUser
);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/status/inactive', validateSetUserInactive, setUserInactive);
router.put('/users/:id/status/active', validateSetUserActive, setUserActive);
router.put('/users/:id/status/deleted', validateSetUserDeleted, setUserDeleted);
router.get('/users/status-options', getUserStatusOptions);
router.put('/users/:id/toggle-state', validateToggleUserState, toggleUserState);

// Page management routes
router.get('/pages', listPagesAdmin);
router.post('/pages', createPageAdmin);
router.get('/pages/:id', getPageAdmin);
router.get('/pages/type/:typeId', getPageByTypeIdAdmin);
router.put('/pages/:id', updatePageAdmin);
router.delete('/pages/:id', deletePageAdmin);

export default router;
