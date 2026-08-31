-- DropForeignKey
ALTER TABLE "reply" DROP CONSTRAINT "reply_authorId_fkey";

-- AlterTable
ALTER TABLE "reply" ADD COLUMN     "isAi" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "resolvedByAi" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "reply" ADD CONSTRAINT "reply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
