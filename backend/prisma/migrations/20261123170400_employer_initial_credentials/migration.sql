-- AlterTable
ALTER TABLE "User" ADD COLUMN     "initialPasswordEncrypted" TEXT,
ADD COLUMN     "initialPasswordSetAt" TIMESTAMP(3);
