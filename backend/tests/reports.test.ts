import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  auth,
  cashPayment,
  createMachineWithQr,
  createPackage,
  resetDatabase,
  seedBase,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  await resetDatabase();
  ctx = await seedBase();
});

async function runSession(machineCode: string, priceSantim: number, durationMinutes = 30) {
  const { machine, qrPayload } = await createMachineWithQr(ctx.businessId, { code: machineCode });
  const pkg = await createPackage(ctx.businessId, {
    name: `Package ${machineCode}`,
    durationMinutes,
    priceSantim,
  });
  const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);
  const started = await api
    .post('/api/v1/sessions/start')
    .set(auth(ctx.employerToken))
    .send({ paymentId: payment.body.data.id, qrToken: qrPayload });
  expect(started.status).toBe(201);
  return { machine, qrPayload, pkg, payment: payment.body.data, session: started.body.data.session };
}

describe('Financial reports and exports', () => {
  it('calculates revenue from real payments only, excluding voided and refunded records', async () => {
    const first = await runSession('REP-1', 5000);
    const second = await runSession('REP-2', 3000, 20);

    // Complete the first session early.
    await api
      .post(`/api/v1/sessions/${first.session.id}/end`)
      .set(auth(ctx.employerToken))
      .send({ reason: 'finished', qrToken: first.qrPayload });

    // Extension adds a separate payment.
    const extensionPackage = await createPackage(ctx.businessId, {
      name: 'Report Extension',
      durationMinutes: 10,
      priceSantim: 1500,
    });
    const extended = await api
      .post(`/api/v1/sessions/${second.session.id}/extend`)
      .set(auth(ctx.employerToken))
      .send({ packageId: extensionPackage.id, idempotencyKey: 'report-extension' });
    expect(extended.status).toBe(200);

    // Voided payments never count as revenue.
    const { machine: thirdMachine } = await createMachineWithQr(ctx.businessId, { code: 'REP-3' });
    const thirdPackage = await createPackage(ctx.businessId, { name: 'Void pkg', priceSantim: 7000 });
    const third = await cashPayment(ctx.employerToken, thirdMachine.id, thirdPackage.id);
    const voided = await api
      .post(`/api/v1/payments/${third.body.data.id}/void`)
      .set(auth(ctx.adminToken))
      .send({ reason: 'Customer cancelled before starting' });
    expect(voided.status).toBe(200);

    // A real expense for the profit calculation.
    const expense = await api
      .post('/api/v1/expenses')
      .set(auth(ctx.adminToken))
      .send({
        title: 'Electricity bill',
        category: 'ELECTRICITY',
        amountSantim: 10000,
        expenseDate: new Date().toISOString(),
      });
    expect(expense.status).toBe(201);

    const revenue = await api.get('/api/v1/reports/revenue').set(auth(ctx.adminToken));
    expect(revenue.status).toBe(200);
    expect(revenue.body.data.totals.revenueSantim).toBe(9500);
    expect(revenue.body.data.totals.transactions).toBe(3);

    const profit = await api.get('/api/v1/reports/profit-loss').set(auth(ctx.adminToken));
    expect(profit.status).toBe(200);
    expect(profit.body.data.totals.revenueSantim).toBe(9500);
    expect(profit.body.data.totals.expensesSantim).toBe(10000);
    expect(profit.body.data.totals.profitSantim).toBe(-500);

    const machines = await api.get('/api/v1/reports/machines').set(auth(ctx.adminToken));
    expect(machines.status).toBe(200);
    expect(machines.body.data.totals.revenueSantim).toBe(9500);
    const rep1 = machines.body.data.items.find((item: { code: string }) => item.code === 'REP-1');
    expect(rep1.revenueSantim).toBe(5000);
    expect(rep1.sessions).toBe(1);

    const employers = await api.get('/api/v1/reports/employers').set(auth(ctx.adminToken));
    expect(employers.body.data.totals.collectedSantim).toBe(9500);

    const packages = await api.get('/api/v1/reports/packages').set(auth(ctx.adminToken));
    expect(packages.status).toBe(200);
    const extension = packages.body.data.items.find((item: { name: string }) => item.name === 'Report Extension');
    expect(extension.revenueSantim).toBe(1500);
    expect(extension.transactions).toBe(1);

    const sessions = await api.get('/api/v1/reports/sessions').set(auth(ctx.adminToken));
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.totals.sessions).toBe(2);

    const expenses = await api.get('/api/v1/reports/expenses').set(auth(ctx.adminToken));
    expect(expenses.body.data.totals.expensesSantim).toBe(10000);
    expect(expenses.body.data.byCategory[0].category).toBe('ELECTRICITY');

    const dashboard = await api.get('/api/v1/admin/dashboard').set(auth(ctx.adminToken));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.revenue.todaySantim).toBe(9500);
    expect(dashboard.body.data.finance.expensesMonthSantim).toBe(10000);
    expect(dashboard.body.data.finance.profitMonthSantim).toBe(-500);
    expect(Array.isArray(dashboard.body.data.revenueSeries)).toBe(true);
  });

  it('filters reports by machine and package', async () => {
    const filtered = await api
      .get('/api/v1/reports/revenue')
      .query({ from: '2000-01-01', to: '2099-12-31' })
      .set(auth(ctx.adminToken));
    expect(filtered.status).toBe(200);

    const machineReport = await api.get('/api/v1/reports/machines').set(auth(ctx.adminToken));
    const machineId = machineReport.body.data.items.find((item: { code: string }) => item.code === 'REP-1').machineId;

    const machineFiltered = await api
      .get('/api/v1/reports/revenue')
      .query({ machineId })
      .set(auth(ctx.adminToken));
    expect(machineFiltered.body.data.totals.revenueSantim).toBe(5000);
  });

  it('exports CSV, Excel and PDF reports', async () => {
    const csv = await api.get('/api/v1/reports/export').query({ type: 'revenue', format: 'csv' }).set(auth(ctx.adminToken));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Revenue Report');

    const xlsx = await api
      .get('/api/v1/reports/export')
      .query({ type: 'profit-loss', format: 'xlsx' })
      .set(auth(ctx.adminToken));
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');

    const pdf = await api
      .get('/api/v1/reports/export')
      .query({ type: 'machines', format: 'pdf' })
      .set(auth(ctx.adminToken));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('rejects invalid date ranges gracefully', async () => {
    const response = await api
      .get('/api/v1/reports/revenue')
      .query({ from: 'not-a-date' })
      .set(auth(ctx.adminToken));
    expect(response.status).toBe(400);
  });
});
