import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { getAnalytics, getDashboard } from '../../services/dashboardService';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await getDashboard(req.user!.businessId);
    res.json({ success: true, data });
  }),
);

const analyticsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  granularity: z.enum(['day', 'week', 'month']).optional(),
});

router.get(
  '/analytics',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as never as {
      from?: string;
      to?: string;
      granularity?: 'day' | 'week' | 'month';
    };
    const data = await getAnalytics(req.user!.businessId, query.from, query.to, query.granularity);
    res.json({ success: true, data });
  }),
);

export default router;
