import type { ListAuditLogsQuery } from '@alipe3d/shared';
import { Router } from 'express';
import { requirePermission, type Authenticate } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/http-response.js';
import type { AuditService } from './audit.service.js';

export function auditRoutes(service: AuditService, authenticate: Authenticate) {
  const router = Router();

  router.get('/', authenticate(), requirePermission('audit:read'), async (req, res) => {
    const result = await service.list(req.query as ListAuditLogsQuery);
    sendSuccess(res, result.items, 200, result.meta);
  });

  return router;
}
