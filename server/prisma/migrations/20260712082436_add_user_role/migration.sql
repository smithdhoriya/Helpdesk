-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'agent');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'agent';
