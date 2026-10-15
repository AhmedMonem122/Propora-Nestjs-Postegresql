-- Role-aware auth (register/login role selection) + organization invite codes.
-- inviteCode is nullable so pre-existing rows keep working; the API lazily
-- mints a code per org on first read instead of backfilling here.
ALTER TABLE "Organization" ADD COLUMN "inviteCode" TEXT;
CREATE UNIQUE INDEX "Organization_inviteCode_key" ON "Organization"("inviteCode");
