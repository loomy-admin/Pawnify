# PAWNIFY & BULLION — PROJECT SUBMISSION & CLIENT HANDOFF DOCUMENT

**Project Name:** Pawnify (Pawn Broker & Jewellery Lending Operations System) & Bullion (Precious Metals Inventory)  
**Version:** 1.0.0 (Production Release)  
**Date of Submission:** October 2026  
**Delivered To:** Client / Business Stakeholder  
**Delivered By:** Engineering & Development Team  

---

## 1. Executive Summary

This document serves as the formal handover for the **Pawnify** gold and silver loan management system and the accompanying **Bullion** trade inventory platform. 

The software has been engineered specifically for Indian jewellery businesses, pawnbrokers, and bullion traders. It provides complete operational automation: from customer KYC and physical collateral appraisal to interest calculation, repayment waterfalls, double-entry financial accounting, and collateral custody release.

The system is fully compliant with standard pawn-broking regulations, including RBI Loan-to-Value (LTV) limits, strict collateral release locks, and non-destructive financial transaction auditing.

---

## 2. Live Production & Access Credentials

### 2.1 Live Application Links
* **Pawnify Web Portal (Production):** [https://pwanify.vercel.app](https://pwanify.vercel.app)
* **Pawnify Source Code Repository:** [https://github.com/Reshander/pwanify](https://github.com/Reshander/pwanify)
* **Bullion Source Code Repository:** [https://github.com/Reshander/bullion](https://github.com/Reshander/bullion)

### 2.2 Default System Accounts
| Role | Mobile Number | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator (Proprietor)** | `9876543210` | `password123` | Full access: Capital introduction, loan approval, settings, accounts, day book, reports |
| **Staff Member (Operator)** | `9876543211` | `password123` | Operational access: Valuations, draft creation, payment collection, customer KYC |

> *Note: It is recommended that the administrator updates default passwords upon first commercial login via the `/profile` page.*

---

## 3. Technology Stack & Enterprise Architecture

* **Framework:** Next.js 16 (React 19, Turbopack, App Router)
* **Backend Runtime:** Node.js (Server Actions & React Server Components)
* **Database Engine:** Pure MySQL with Sequelize ORM (`mysql2`) on TiDB Cloud Serverless (SSL-encrypted)
* **Precision Mathematics:** `decimal.js` (Exact decimal arithmetic — prevents floating-point penny errors)
* **Authentication:** Better-Auth with custom Indian 10-digit mobile login plugin & secure bcrypt password hashing
* **User Interface:** Modern Vanilla CSS + Tailwind CSS, responsive mobile/desktop dashboard, Lucide icons
* **Hosting:** Vercel Global Edge Network with continuous CI/CD deployment

### Security Highlights
* **Zero Public API Attack Surface:** Pages and actions run using React Server Components and Next.js Server Actions. Database queries and financial formulas run exclusively on the server and are never exposed as public REST endpoints.
* **ACID Transactions:** Financial operations (loan disbursals, repayments, reversals) are wrapped in managed database transactions to guarantee ledger consistency.

---

## 4. The 15 Core Business Functions Implemented

The system implements the complete 15-point business operational flow:

### 1. Capital Introduction & Lending Pool
* Enables the owner/investor to inject capital into the shop's lending pool.
* **Strict Non-Income Rule:** Injected funds credit cash drawer (`CASH-01`) or bank (`BANK-01`) without counting as customer revenue or loan interest income.
* Provides a real-time summary card showing Total Capital, Disbursed Funds, Collections, and Net Available Lending Cash.

### 2. Item Evaluation & LTV Calculation
* Calculates Gross Weight, Stone Weight deduction, Net Weight, and Fine Weight equivalent.
* Built-in purity presets for BIS Hallmarking (24K - 99.9%, 22K - 91.6%, 18K - 75%, 14K - 58.5%) and custom purity entries.
* Enforces regulatory tiered Loan-To-Value (LTV) limits:
  * $\le$ ₹2,50,000: **Up to 85% LTV**
  * ₹2,50,001 to ₹5,00,000: **Up to 80% LTV**
  * $>$ ₹5,00,000: **Up to 75% LTV**

### 3. Create Loan / Save Draft
* Captures customer pledge, item breakdown, packet numbers, storage location/safe box, tenure, and agreed interest rate.
* Saved as `DRAFT` with **zero financial impact** (no cash leaves the counter until approval and disbursal).

### 4. Loan Approval Workflow
* Authorized review step (Admin / Manager) verifying customer KYC and item evaluation.
* Transitions loan status from `DRAFT` to `APPROVED`, locking item valuation and terms.

### 5. Loan Disbursement Engine
* Moves loan status to `ACTIVE`.
* Automatically debits the designated Counter Cash account or Bank account and creates a formal `DISBURSEMENT` double-entry ledger record.

### 6. Dynamic Interest Engine
Supports both industry calculation standards:
* **Standard Model:** Simple interest computed on-read on remaining principal using Actual/365 day-count convention.
* **Cumulative Compounding Model:** Calculates periodic unpaid interest and compounds it into the capital balance according to selected frequency (Monthly, Quarterly, Half-Yearly, Yearly).

### 7. Repayment & 3-Tier Settlement Waterfall
Every customer payment is automatically split according to banking regulatory priority:
1. **Tier 1:** Pending penalty charges and administrative fees
2. **Tier 2:** Accrued interest to date
3. **Tier 3:** Remaining payment directly reduces principal outstanding
* Generates printable payment receipts with running principal balance.

### 8. Chronological Loan Statements
* Detailed customer account statements listing every disbursal, payment, interest charge, receipt number, and remaining balance.

### 9. Preclosure & Settlement Quotations
* Instant quotation for any chosen settlement date: calculates exact principal + accrued interest up to that date + fees.

### 10 & 11. Loan Settlement & Normal Closure
* Verifies zero remaining principal and interest, marks loan status `CLOSED` / `REDEEMED`, and posts a `CLOSURE` ledger entry.

### 12. Draft Cancellation
* Allows canceling unapproved drafts cleanly without leaving orphan financial transactions.

### 13. Non-Destructive Transaction Reversals
* Follows the **Golden Rule of Immutability**: posted payments or disbursements are **never deleted or overwritten**.
* Creates compensating `REVERSAL` ledger entries that adjust the cash drawer and restore principal balance while preserving the complete audit history.

### 14. Collateral Custody & Release Lock
* **Automated Guard:** Physically and digitally locks item release. Collateral cannot be marked as released while principal $> 0$ or while the loan is active.

### 15. Financial Reports, Day Book & Chart of Accounts
* **Day Book:** Daily chronological inflows and outflows.
* **Cash & Bank Books:** Running balances of counter cash and bank accounts.
* **Account Master:** Flexible Chart of Accounts (Assets, Liabilities, Income, Expenses, Equity).
* **Portfolio Health:** Overdue tracking, active principal exposure, and collection efficiency.

---

## 5. Quality Assurance & Verification Metrics

Prior to handover, the code underwent full verification:

| Testing Level | Scope | Result |
| :--- | :--- | :--- |
| **Unit & Integration Tests** | 14 test suites covering interest engine, waterfall allocations, double-entry ledger, and permissions | **241 / 241 Passed (100%)** |
| **Production Build (`next build`)** | All 23 Next.js routes compiled and statically optimized | **0 Build Errors** |
| **Type Integrity** | Strict TypeScript configuration | **0 Compilation Errors** |
| **Database Performance** | Live cloud database with pooled connections and SSL encryption | **Active & Verified** |

---

## 6. Handover Checklist & Deployment Verification

- [x] Cloud database provisioned and connected on TiDB Cloud Serverless (MySQL).
- [x] Initial database schemas, settings, and chart of accounts seeded.
- [x] ₹10,00,000 initial owner lending pool introduced and verified positive.
- [x] Live application deployed and accessible globally at `https://pwanify.vercel.app`.
- [x] Git repositories synchronized and clean on GitHub.
- [x] Documentation and client operational guide completed.

---

*This document marks the successful completion and official handover of the Pawnify & Bullion software systems.*
