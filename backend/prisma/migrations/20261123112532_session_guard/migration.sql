-- Database-level business rules that Prisma cannot express in the schema.

-- Only one active (CREATED / ACTIVE / PAUSED) session may exist per machine,
-- even if two clients race each other. The application also locks the machine
-- row, but this index makes the invariant impossible to violate.
CREATE UNIQUE INDEX "GameSession_one_active_per_machine"
  ON "GameSession" ("machineId")
  WHERE status IN ('CREATED', 'ACTIVE', 'PAUSED');

-- Financial and duration sanity checks.
ALTER TABLE "GamePackage"
  ADD CONSTRAINT "GamePackage_duration_positive" CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 1440),
  ADD CONSTRAINT "GamePackage_price_non_negative" CHECK ("priceSantim" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountSantim" > 0),
  ADD CONSTRAINT "Payment_duration_positive" CHECK ("durationMinutesSnapshot" > 0);

ALTER TABLE "GameSession"
  ADD CONSTRAINT "GameSession_duration_positive" CHECK ("durationMinutesSnapshot" > 0),
  ADD CONSTRAINT "GameSession_price_non_negative" CHECK ("priceSantim" >= 0),
  ADD CONSTRAINT "GameSession_end_after_start" CHECK ("startedAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startedAt");

ALTER TABLE "SessionExtension"
  ADD CONSTRAINT "SessionExtension_duration_positive" CHECK ("durationMinutes" > 0),
  ADD CONSTRAINT "SessionExtension_price_non_negative" CHECK ("priceSantim" >= 0),
  ADD CONSTRAINT "SessionExtension_end_after_previous" CHECK ("newEndsAt" > "previousEndsAt");

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_amount_positive" CHECK ("amountSantim" > 0);
