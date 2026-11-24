import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type ExpenseCategory } from '@prisma/client';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { paginationSchema, buildPageMeta, getPagination } from '../../utils/pagination';
import { recordAudit } from '../../services/auditService';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

const categories = ['ELECTRICITY', 'MAINTENANCE', 'RENT', 'INTERNET', 'EMPLOYEE_COSTS', 'OTHER'] as const;

const createSchema = z.object({
  title: z.string().trim().min(2, 'Expense title is required').max(120),
  category: z.enum(categories),
  amountSantim: z.coerce.number().int().min(1, 'Amount must be greater than zero').max(1_000_000_000),
  description: z.string().trim().max(1000).optional(),
  expenseDate: z.coerce.date(),
  receiptUrl: z.string().trim().max(2000).optional(),
});

const updateSchema = createSchema.partial();

const listQuerySchema = paginationSchema.extend({
  category: z.enum(categories).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(120).optional(),
});

const expenseInclude = { recordedBy: { select: { id: true, fullName: true } } } satisfies Prisma.ExpenseInclude;

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as never as {
      page: number;
      pageSize: number;
      category?: ExpenseCategory;
      from?: string;
      to?: string;
      search?: string;
    };
    const pagination = getPagination(query);
    const where: Prisma.ExpenseWhereInput = {
      businessId: req.user!.businessId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.from || query.to
        ? {
            expenseDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, expenses, totalAmount, byCategory] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.expense.aggregate({ where, _sum: { amountSantim: true } }),
      prisma.expense.groupBy({ by: ['category'], where, _sum: { amountSantim: true }, _count: { _all: true } }),
    ]);

    res.json({
      success: true,
      data: expenses,
      meta: buildPageMeta(total, pagination),
      summary: {
        totalSantim: totalAmount._sum.amountSantim ?? 0,
        byCategory: byCategory.map((row) => ({
          category: row.category,
          amountSantim: row._sum.amountSantim ?? 0,
          count: row._count._all,
        })),
      },
    });
  }),
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const expense = await prisma.expense.create({
      data: {
        businessId: req.user!.businessId,
        title: req.body.title.trim(),
        category: req.body.category,
        amountSantim: req.body.amountSantim,
        description: req.body.description?.trim() || null,
        expenseDate: req.body.expenseDate,
        receiptUrl: req.body.receiptUrl?.trim() || null,
        recordedById: req.user!.id,
      },
      include: expenseInclude,
    });

    await recordAudit(prisma, {
      businessId: req.user!.businessId,
      userId: req.user!.id,
      actorRole: 'ADMIN',
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      after: {
        title: expense.title,
        category: expense.category,
        amountSantim: expense.amountSantim,
        expenseDate: expense.expenseDate,
      },
      req,
    });

    res.status(201).json({ success: true, data: expense });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.expense.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Expense', 'EXPENSE_NOT_FOUND');

    const updated = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...(req.body.title !== undefined ? { title: req.body.title.trim() } : {}),
        ...(req.body.category !== undefined ? { category: req.body.category } : {}),
        ...(req.body.amountSantim !== undefined ? { amountSantim: req.body.amountSantim } : {}),
        ...(req.body.description !== undefined ? { description: req.body.description?.trim() || null } : {}),
        ...(req.body.expenseDate !== undefined ? { expenseDate: req.body.expenseDate } : {}),
        ...(req.body.receiptUrl !== undefined ? { receiptUrl: req.body.receiptUrl?.trim() || null } : {}),
      },
      include: expenseInclude,
    });

    await recordAudit(prisma, {
      businessId: req.user!.businessId,
      userId: req.user!.id,
      actorRole: 'ADMIN',
      action: 'EXPENSE_UPDATED',
      entityType: 'Expense',
      entityId: existing.id,
      before: {
        title: existing.title,
        category: existing.category,
        amountSantim: existing.amountSantim,
        expenseDate: existing.expenseDate,
      },
      after: {
        title: updated.title,
        category: updated.category,
        amountSantim: updated.amountSantim,
        expenseDate: updated.expenseDate,
      },
      req,
    });

    res.json({ success: true, data: updated });
  }),
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.expense.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Expense', 'EXPENSE_NOT_FOUND');

    await prisma.$transaction(async (tx) => {
      await tx.expense.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      await recordAudit(tx, {
        businessId: req.user!.businessId,
        userId: req.user!.id,
        actorRole: 'ADMIN',
        action: 'EXPENSE_DELETED',
        entityType: 'Expense',
        entityId: existing.id,
        before: {
          title: existing.title,
          category: existing.category,
          amountSantim: existing.amountSantim,
          expenseDate: existing.expenseDate,
        },
        req,
      });
    });

    res.json({ success: true, data: { message: 'Expense removed' } });
  }),
);

export default router;
