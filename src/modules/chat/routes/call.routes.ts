/**
 * Call Routes
 * REST API routes for call notifications and call logs
 */

import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { mobileAuth } from '../../../middleware/mobile-auth.middleware';

const router = Router();
const callController = new CallController();

/**
 * POST /api/v1/mobile/call/start
 * Start a call by sending notification to receiver and creating call log
 */
router.post('/start', mobileAuth, callController.startCall);

/**
 * POST /api/v1/mobile/call/status
 * Update call status (reject, end, or not_answered)
 */
router.post('/status', mobileAuth, callController.updateCallStatusSimple);

/**
 * POST /api/v1/mobile/call/log
 * Store call log directly (legacy)
 */
router.post('/log', mobileAuth, callController.storeCallLogV2);

/**
 * POST /api/v1/mobile/call/notify
 * Send call notification (legacy)
 */
router.post('/notify', mobileAuth, callController.sendCallNotification);

/**
 * GET /api/v1/mobile/call/logs
 * Get call logs/history
 */
router.get('/logs', mobileAuth, callController.getCallLogs);

/**
 * GET /api/v1/mobile/call/:callId
 * Get specific call log by ID
 */
router.get('/:callId', mobileAuth, callController.getCallLogById);

/**
 * PATCH /api/v1/mobile/call/:callId/status
 * Update call status (answered, rejected, ended, missed) - legacy endpoint
 */
router.patch('/:callId/status', mobileAuth, callController.updateCallStatus);

export default router;
