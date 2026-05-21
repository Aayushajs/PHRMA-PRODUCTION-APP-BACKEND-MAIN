/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Routes - Service 1                                       │
│  Handles routing for Firebase push notifications                       │
│  All business logic delegated to NotificationService                   │
│  QUEUE-FIRST ARCHITECTURE: All notifications routed through Redis      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from 'express';
import NotificationService from '../../Services/NotificationServices/notification.Service';
import { authenticatedUserMiddleware } from '../../Middlewares/CheckLoginMiddleware';
import { internalServiceAuth } from '../../Middlewares/internalServiceAuth';
import { validateRequest } from '../../Middlewares/validateRequest';
import {
  sendToUserSchema,
  sendSchema,
  sendToUsersSchema,
  sendBulkSchema,
} from '../../Utils/lib/validators/notification.Validator';

const notificationRouter = Router();

/*
┌─────────────────────────────────────────────────────────────────┐
│  PUBLIC ROUTES (No Authentication)                              │
└─────────────────────────────────────────────────────────────────┘
*/

notificationRouter.get('/health', NotificationService.health);

notificationRouter.get('/queue-stats', NotificationService.queueStats);

/*
┌─────────────────────────────────────────────────────────────────┐
│  AUTHENTICATED USER ROUTES (JWT Token Required)                 │
└─────────────────────────────────────────────────────────────────┘
*/

notificationRouter.post(
  '/sendToUser',
  authenticatedUserMiddleware,
  validateRequest({ body: sendToUserSchema }),
  NotificationService.sendToUser
);

/*
┌─────────────────────────────────────────────────────────────────┐
│  INTERNAL API ROUTES (Internal API Key Required)                │
└─────────────────────────────────────────────────────────────────┘
*/

notificationRouter.post('/send', internalServiceAuth, validateRequest({ body: sendSchema }), NotificationService.send);

notificationRouter.post('/send-to-user', internalServiceAuth, validateRequest({ body: sendToUsersSchema }), NotificationService.sendToUsers);

notificationRouter.post('/sendToUsers', internalServiceAuth, validateRequest({ body: sendToUsersSchema }), NotificationService.sendToUsers);

notificationRouter.post('/send-to-users', internalServiceAuth, validateRequest({ body: sendToUsersSchema }), NotificationService.sendToUsers);

notificationRouter.post('/sendBulk', internalServiceAuth, validateRequest({ body: sendBulkSchema }), NotificationService.sendBulk);

notificationRouter.post('/send-bulk', internalServiceAuth, validateRequest({ body: sendBulkSchema }), NotificationService.sendBulk);

export default notificationRouter;
