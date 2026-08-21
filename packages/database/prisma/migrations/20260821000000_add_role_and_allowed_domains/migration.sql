-- AlterTable: Add role and allowedDomains columns to users table
ALTER TABLE "users" ADD COLUMN "role" TEXT,
ADD COLUMN "allowed_domains" TEXT;
