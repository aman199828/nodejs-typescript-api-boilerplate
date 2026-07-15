/**
 * Chat Routes
 * REST API routes for chat functionality
 */

import { Router } from 'express';
import { mobileAuth } from '../../../middleware/mobile-auth.middleware';
import { MessageController, uploadChatFile } from '../controllers/message.controller';
import { ConversationController } from '../controllers/conversation.controller';

// Get Socket.IO server instance if available
let ioInstance: any = undefined;

export function setSocketIOInstance(io: any) {
  ioInstance = io;
  // Update message controller with new io instance
  messageController = new MessageController(ioInstance);
}

const router = Router();
let messageController = new MessageController(ioInstance);
const conversationController = new ConversationController();

/**
 * @swagger
 * /api/v1/mobile/chat/messages:
 *   post:
 *     summary: Send a message
 *     description: Send a text message, media message (with S3 URL), or upload a file
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageType
 *             properties:
 *               conversationId:
 *                 type: integer
 *                 description: Conversation ID (optional if recipientId is provided)
 *               recipientId:
 *                 type: integer
 *                 description: Recipient ID (required if conversationId is not provided)
 *               content:
 *                 type: string
 *                 description: Text content (optional for media messages)
 *               messageType:
 *                 type: integer
 *                 description: Message type (1=text, 2=image, 3=video, 4=audio, 5=file, etc.)
 *               mediaUrl:
 *                 type: string
 *                 description: S3 URL if mobile already uploaded the file
 *               thumbnailUrl:
 *                 type: string
 *                 description: Thumbnail URL for videos
 *               fileName:
 *                 type: string
 *               fileSize:
 *                 type: integer
 *               mimeType:
 *                 type: string
 *               replyToId:
 *                 type: integer
 *               storyId:
 *                 type: integer
 *               isDisappearing:
 *                 type: boolean
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               sharedPostId:
 *                 type: integer
 *               sharedClipId:
 *                 type: integer
 *               sharedUserId:
 *                 type: integer
 *               sharedLocation:
 *                 type: string
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               conversationId:
 *                 type: integer
 *               recipientId:
 *                 type: integer
 *               content:
 *                 type: string
 *               messageType:
 *                 type: integer
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (image, video, audio, or document)
 *               replyToId:
 *                 type: integer
 *               storyId:
 *                 type: integer
 *               isDisappearing:
 *                 type: boolean
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               sharedPostId:
 *                 type: integer
 *               sharedClipId:
 *                 type: integer
 *               sharedUserId:
 *                 type: integer
 *               sharedLocation:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// Message routes
router.post('/messages', mobileAuth, uploadChatFile, messageController.sendMessage);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/{conversationId}/messages:
 *   get:
 *     summary: Get messages from a conversation
 *     description: Retrieve messages from a conversation with pagination support (both offset and cursor-based)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Conversation ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number (for offset-based pagination)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of messages per page (max 100)
 *       - in: query
 *         name: before
 *         schema:
 *           type: integer
 *         description: Message ID to fetch messages before (cursor-based pagination)
 *       - in: query
 *         name: after
 *         schema:
 *           type: integer
 *         description: Message ID to fetch messages after (cursor-based pagination)
 *       - in: query
 *         name: messageType
 *         schema:
 *           type: integer
 *         description: Filter by message type (1=text, 2=image, 3=video, etc.)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in message content
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages from this date (ISO 8601)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter messages to this date (ISO 8601)
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *         description: Include deleted messages (default: false)
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (asc=oldest first, desc=newest first)
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a participant in this conversation
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
router.get('/conversations/:conversationId/messages', mobileAuth, messageController.getMessages);

// Conversation routes
/**
 * @swagger
 * /api/v1/mobile/chat/conversations:
 *   get:
 *     summary: List conversations
 *     description: Get all conversations for the authenticated user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page (max 50)
 *       - in: query
 *         name: type
 *         schema:
 *           type: integer
 *         description: Filter by type (1=direct, 2=group)
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *         description: Show only conversations with unread messages
 *       - in: query
 *         name: muted
 *         schema:
 *           type: boolean
 *         description: Filter by muted status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in conversation names or participant names
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/conversations', mobileAuth, conversationController.listConversations);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/{id}:
 *   get:
 *     summary: Get conversation by ID
 *     description: Get detailed information about a specific conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully
 *       404:
 *         description: Conversation not found
 */
router.get('/conversations/:id', mobileAuth, conversationController.getConversation);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/direct:
 *   post:
 *     summary: Create direct conversation
 *     description: Create a new 1-on-1 conversation with another user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Conversation created successfully
 *       400:
 *         description: Invalid request
 */
router.post('/conversations/direct', mobileAuth, conversationController.createDirectConversation);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/groups:
 *   post:
 *     summary: Create group conversation
 *     description: Create a new group conversation with multiple participants
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participantIds
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *               imageStorage:
 *                 type: string
 *               participantIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Group conversation created successfully
 *       400:
 *         description: Invalid request
 */
router.post('/conversations/groups', mobileAuth, conversationController.createGroupConversation);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/{id}:
 *   put:
 *     summary: Update conversation
 *     description: Update group conversation settings (admin only)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *               imageStorage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Conversation updated successfully
 *       403:
 *         description: Only admins can update group settings
 */
router.put('/conversations/:id', mobileAuth, conversationController.updateConversation);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/{id}:
 *   delete:
 *     summary: Delete or leave conversation
 *     description: Delete a direct conversation or leave a group conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: deleteFor
 *         schema:
 *           type: integer
 *         description: User ID for "delete for me"
 *     responses:
 *       200:
 *         description: Conversation deleted successfully
 */
router.delete('/conversations/:id', mobileAuth, conversationController.deleteOrLeaveConversation);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/{id}/participants:
 *   get:
 *     summary: Get conversation participants
 *     description: Get all participants in a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Participants retrieved successfully
 */
router.get('/conversations/:id/participants', mobileAuth, conversationController.getParticipants);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/{id}/read:
 *   post:
 *     summary: Mark conversation as read
 *     description: Mark all or specific messages in a conversation as read
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Conversation marked as read
 */
router.post('/conversations/:id/read', mobileAuth, conversationController.markAsRead);

/**
 * @swagger
 * /api/v1/mobile/chat/conversations/{id}/mute:
 *   post:
 *     summary: Mute or unmute conversation
 *     description: Mute or unmute notifications for a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - muted
 *             properties:
 *               muted:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Conversation muted/unmuted successfully
 */
router.post('/conversations/:id/mute', mobileAuth, conversationController.muteConversation);

// Call routes
import callRoutes from './call.routes';
router.use('/calls', callRoutes);

export default router;
