/**
 * Customer Service — CRUD, Search, KYC Management (Sequelize MySQL)
 */

import { Op } from "sequelize";
import { Customer, KycDocument, Loan, User, AppSetting, sequelize } from "@/lib/db";

// ==================== Types ====================

export interface CustomerCreateData {
  fullName: string;
  phone: string;
  email?: string;
  dob?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  photoUrl?: string;
  kycDocuments?: Array<{
    docType: "AADHAAR" | "PAN" | "VOTER_ID" | "PASSPORT" | "DRIVING_LICENSE";
    docNumber: string;
    fileUrl?: string;
  }>;
}

export interface CustomerFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

// ==================== CRUD ====================

export async function createCustomer(data: CustomerCreateData, staffId: string) {
  return await sequelize.transaction(async (t) => {
    const customer = await Customer.create(
      {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email || null,
        dob: data.dob ? new Date(data.dob) : null,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        photoUrl: data.photoUrl || null,
        createdById: staffId,
      },
      { transaction: t }
    );

    if (data.kycDocuments?.length) {
      await KycDocument.bulkCreate(
        data.kycDocuments.map((doc) => ({
          customerId: customer.id,
          docType: doc.docType,
          docNumber: doc.docNumber,
          fileUrl: doc.fileUrl || null,
        })),
        { transaction: t }
      );
    }

    const created = await Customer.findByPk(customer.id, {
      include: [{ model: KycDocument, as: "kycDocuments" }],
      transaction: t,
    });
    return created?.toJSON();
  });
}

export async function getCustomers(filters: CustomerFilters = {}) {
  const { page = 1, pageSize = 20, search } = filters;
  const offset = (page - 1) * pageSize;

  const whereClause: Record<string, unknown> = {};

  if (search) {
    whereClause[Op.or as unknown as string] = [
      { fullName: { [Op.like]: `%${search}%` } },
      { phone: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Customer.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: KycDocument,
        as: "kycDocuments",
        attributes: ["docType", "status"],
      },
      {
        model: Loan,
        as: "loans",
        attributes: ["id"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: pageSize,
    offset,
    distinct: true,
  });

  const customers = rows.map((c) => {
    const json = c.toJSON() as any;
    json._count = { loans: json.loans?.length || 0 };
    return json;
  });

  return {
    customers,
    total: count,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize),
  };
}

export async function getCustomerById(id: string) {
  const customer = await Customer.findByPk(id, {
    include: [
      { model: KycDocument, as: "kycDocuments" },
      {
        model: User,
        as: "createdBy",
        attributes: ["id", "name"],
      },
      {
        model: Loan,
        as: "loans",
        attributes: [
          "id",
          "loanNumber",
          "loanDate",
          "dueDate",
          "gracePeriodDays",
          "principalAmount",
          "principalOutstanding",
          "status",
          "totalAssessedValue",
        ],
        order: [["createdAt", "DESC"]],
      },
    ],
  });

  return customer ? (customer.toJSON() as any) : null;
}

/**
 * Typeahead search for customer selection in loan creation.
 */
export async function searchCustomers(query: string, limit = 10) {
  if (!query || query.length < 2) return [];

  const customers = await Customer.findAll({
    where: {
      [Op.or]: [
        { fullName: { [Op.like]: `%${query}%` } },
        { phone: { [Op.like]: `%${query}%` } },
      ],
    },
    attributes: ["id", "fullName", "phone", "city"],
    limit,
    order: [["fullName", "ASC"]],
  });

  return customers.map((c) => c.toJSON());
}

// ==================== KYC ====================

export async function updateKycStatus(
  docId: string,
  status: "PENDING" | "VERIFIED" | "REJECTED",
  verifiedById: string
) {
  await KycDocument.update(
    {
      status,
      verifiedById: status !== "PENDING" ? verifiedById : null,
    },
    { where: { id: docId } }
  );

  const updated = await KycDocument.findByPk(docId);
  return updated ? updated.toJSON() : null;
}

export async function addKycDocument(
  customerId: string,
  docType: "AADHAAR" | "PAN" | "VOTER_ID" | "PASSPORT" | "DRIVING_LICENSE",
  docNumber: string,
  fileUrl?: string
) {
  const created = await KycDocument.create({
    customerId,
    docType,
    docNumber,
    fileUrl: fileUrl || null,
  });
  return created.toJSON();
}

/**
 * Check if PAN is required based on loan amount threshold.
 * Default threshold: ₹50,000 (configurable via AppSetting).
 */
export async function checkPanRequired(customerId: string): Promise<{
  required: boolean;
  hasPan: boolean;
  threshold: number;
}> {
  const setting = await AppSetting.findByPk("pan.threshold");
  const threshold = setting ? parseFloat(setting.value) : 50000;

  const panDoc = await KycDocument.findOne({
    where: { customerId, docType: "PAN" },
  });

  const totalDisbursed = (await Loan.sum("principalAmount", {
    where: { customerId, status: "ACTIVE" },
  })) || 0;

  const totalAmount = Number(totalDisbursed);

  return {
    required: totalAmount >= threshold,
    hasPan: panDoc !== null,
    threshold,
  };
}
