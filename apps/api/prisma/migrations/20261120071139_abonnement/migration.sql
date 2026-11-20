-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('ESSENTIEL', 'CONFORT', 'PATRIMOINE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'FAILED', 'VOID');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentMethodKind" AS ENUM ('CARD', 'MOBILE_MONEY');

-- CreateTable
CREATE TABLE "Subscription" (
    "ownerId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "planId" "PlanId",
    "nextPlanId" "PlanId",
    "units" INTEGER NOT NULL DEFAULT 0,
    "period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "trialEndsAt" DATE,
    "periodEnd" DATE NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "reminded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "vat" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "method" "PaymentMethodKind" NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "cacheWrite" INTEGER NOT NULL,
    "cacheRead" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "webSearches" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL,
    "expert" BOOLEAN NOT NULL DEFAULT false,
    "extraBilled" BOOLEAN NOT NULL DEFAULT false,
    "billedInvoiceId" TEXT,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_ownerId_issuedAt_idx" ON "Invoice"("ownerId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerRef_key" ON "PaymentAttempt"("providerRef");

-- CreateIndex
CREATE INDEX "PaymentAttempt_ownerId_createdAt_idx" ON "PaymentAttempt"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_ownerId_at_idx" ON "UsageRecord"("ownerId", "at");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Subscription"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Subscription"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
