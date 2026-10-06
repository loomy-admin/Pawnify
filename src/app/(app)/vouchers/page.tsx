import { VouchersClient } from "./vouchers-client";

export const metadata = {
  title: "Vouchers (Jama / Kharcha) | Pawnify",
  description: "Receive money (Jama) & Send money (Kharcha) voucher management",
};

export default function VouchersPage() {
  return <VouchersClient />;
}
