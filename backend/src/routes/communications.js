const express = require('express');
const {
  createCommunication,
  listCommunications,
  markRead,
  markAllRead,
  archive,
  getInboxCount,
} = require('../services/communications-service');
const { sendTemplate } = require('../services/sms-service');

function createCommunicationsRouter({
  authenticate = (req, res, next) => next(),
  dbQuery,
} = {}) {
  const router = express.Router();

  router.get('/', authenticate, async (req, res, next) => {
    try {
      const rows = await listCommunications({
        userId: req.query.userId,
        leadId: req.query.leadId,
        type: req.query.type,
        direction: req.query.direction,
        status: req.query.status,
        limit: req.query.limit,
        includeArchived: req.query.filter === 'all',
      }, dbQuery);

      const unreadCount = await getInboxCount(req.user?.userId || req.query.userId, dbQuery);
      const unreadRows = rows.filter(row => !row.read_at);
      res.json({ notifications: rows, communications: rows, unreadCount, count: rows.length, unread: unreadRows.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/unread-count', authenticate, async (req, res, next) => {
    try {
      const count = await getInboxCount(req.user?.userId || req.query.userId, dbQuery);
      res.json({ count });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/read', authenticate, async (req, res, next) => {
    try {
      await markRead(req.params.id, req.user?.userId, dbQuery);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/read-all', authenticate, async (req, res, next) => {
    try {
      await markAllRead(req.user?.userId, dbQuery);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/archive', authenticate, async (req, res, next) => {
    try {
      await archive(req.params.id, req.user?.userId, dbQuery);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sms', authenticate, async (req, res, next) => {
    try {
      const body = req.body || {};
      if (!body.messageBody) {
        return res.status(400).json({ error: 'messageBody is required' });
      }
      const communication = await createCommunication({
        userId: body.userId || req.user?.userId,
        leadId: body.leadId || null,
        opportunityId: body.opportunityId || null,
        type: 'sms',
        direction: body.direction || 'outbound',
        status: body.status || 'scheduled',
        phoneNumber: body.phoneNumber || null,
        emailAddress: body.emailAddress || null,
        senderName: body.senderName || null,
        recipientName: body.recipientName || null,
        subject: body.subject || null,
        messageBody: body.messageBody,
        externalId: body.externalId || null,
        externalStatus: body.externalStatus || 'disabled',
        transcription: body.transcription || null,
        durationSeconds: body.durationSeconds ?? null,
        templateKey: body.templateKey || null,
        stage: body.stage || null,
        scheduledAt: body.scheduledAt || null,
        sentAt: body.sentAt || null,
        deliveredAt: body.deliveredAt || null,
        failedReason: body.failedReason || null,
        createdBy: req.user?.userId || null,
      }, dbQuery);

      res.status(201).json({ communication });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sms/template', authenticate, async (req, res, next) => {
    try {
      const { templateKey, lead, contactId } = req.body || {};
      if (!templateKey) {
        return res.status(400).json({ error: 'templateKey is required' });
      }

      const result = await sendTemplate(lead || {}, templateKey, contactId);
      res.status(result.sent ? 200 : 202).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createCommunicationsRouter();
module.exports.createCommunicationsRouter = createCommunicationsRouter;
