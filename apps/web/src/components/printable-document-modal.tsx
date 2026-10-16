"use client";

import { useState } from "react";
import { X, Printer, FileText, Receipt, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PrescriptionPrintData = {
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  clinicEmail?: string;
  gstin?: string;
  prescriptionDate: string;
  doctorName: string;
  clientName: string;
  clientPhone?: string;
  petName: string;
  petSpecies?: string;
  petBreed?: string;
  petWeight?: string;
  vitals?: string;
  symptoms?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  doctorRemarks?: string;
  items: Array<{
    medicineName: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
    quantity?: number;
  }>;
};

export type InvoicePrintData = {
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  clinicEmail?: string;
  gstin?: string;
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  clientPhone?: string;
  petName?: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  paymentStatus: "PAID" | "PENDING" | "PARTIAL";
  paymentMethod?: string;
  notes?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  documentType: "PRESCRIPTION" | "INVOICE";
  prescriptionData?: PrescriptionPrintData;
  invoiceData?: InvoicePrintData;
};

export function PrintableDocumentModal({
  isOpen,
  onClose,
  documentType,
  prescriptionData,
  invoiceData,
}: Props) {
  const [thermalMode, setThermalMode] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const defaultClinicName = "PAWCARE SUPER SPECIALTY VETERINARY HOSPITAL";
  const defaultAddress = "104 Healthcare Boulevard, Medical Enclave, Central City";
  const defaultPhone = "+91 98765 43210";
  const defaultEmail = "care@pawcareclinic.test";
  const defaultGstin = "GSTIN: 29AAAAA0000A1Z5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      {/* Container */}
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] print:max-w-none print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Top bar (Hidden when printing) */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
              {documentType === "PRESCRIPTION" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <Receipt className="h-4 w-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {documentType === "PRESCRIPTION" ? "Official Medical Prescription" : "Tax Invoice & Official Receipt"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {documentType === "PRESCRIPTION" ? "Print-ready clinical Rx slip" : "Ready for counter billing & thermal slip"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {documentType === "INVOICE" && (
              <button
                type="button"
                onClick={() => setThermalMode(!thermalMode)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                  thermalMode
                    ? "bg-amber-50 text-amber-800 border-amber-300"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {thermalMode ? "80mm Thermal Receipt (Active)" : "Switch to 80mm Thermal"}
              </button>
            )}

            <Button size="sm" onClick={handlePrint} className="bg-teal-700 hover:bg-teal-800 text-white gap-1.5 shadow-xs">
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible bg-slate-100/60 print:bg-white flex justify-center">
          
          {/* ============================================================== */}
          {/* A. PRESCRIPTION SLIP */}
          {/* ============================================================== */}
          {documentType === "PRESCRIPTION" && prescriptionData && (
            <div
              id="printable-area"
              className="w-full max-w-2xl bg-white p-8 rounded-xl shadow-xs border border-slate-200/90 print:border-none print:shadow-none print:p-6 print:w-full"
            >
              {/* Header */}
              <div className="border-b-2 border-teal-700 pb-4 mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-lg font-black tracking-tight text-teal-950 uppercase">
                      {prescriptionData.clinicName || defaultClinicName}
                    </h1>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {prescriptionData.clinicAddress || defaultAddress}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Tel: {prescriptionData.clinicPhone || defaultPhone} • Email: {prescriptionData.clinicEmail || defaultEmail}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                      {prescriptionData.gstin || defaultGstin}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-bold text-teal-900 uppercase">
                      Outpatient Rx
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      Date: <strong className="text-slate-800">{prescriptionData.prescriptionDate}</strong>
                    </p>
                    <p className="text-xs text-slate-700">
                      Doctor: <strong className="text-teal-900">{prescriptionData.doctorName}</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Patient & Client Demographics */}
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs border border-slate-200/80 mb-5">
                <div>
                  <span className="text-slate-500">Pet Name:</span>{" "}
                  <strong className="text-slate-900 font-bold">{prescriptionData.petName}</strong>{" "}
                  {prescriptionData.petSpecies && (
                    <span className="text-slate-600">({prescriptionData.petSpecies} / {prescriptionData.petBreed || "Mixed"})</span>
                  )}
                  {prescriptionData.petWeight && (
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Weight: <strong>{prescriptionData.petWeight} kg</strong>
                    </div>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">Pet Parent:</span>{" "}
                  <strong className="text-slate-900">{prescriptionData.clientName}</strong>
                  {prescriptionData.clientPhone && (
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Phone: {prescriptionData.clientPhone}
                    </div>
                  )}
                </div>
              </div>

              {/* Clinical Vitals & Assessment */}
              {(prescriptionData.symptoms || prescriptionData.diagnosis || prescriptionData.vitals) && (
                <div className="mb-4 text-xs space-y-1.5 border-l-2 border-teal-600 pl-3 py-0.5">
                  {prescriptionData.vitals && (
                    <p className="text-slate-600">
                      <strong className="text-slate-800">Recorded Vitals:</strong> {prescriptionData.vitals}
                    </p>
                  )}
                  {prescriptionData.symptoms && (
                    <p className="text-slate-600">
                      <strong className="text-slate-800">Presenting Symptoms:</strong> {prescriptionData.symptoms}
                    </p>
                  )}
                  {prescriptionData.diagnosis && (
                    <p className="text-slate-800 font-semibold">
                      <strong className="text-teal-900">Clinical Diagnosis:</strong> {prescriptionData.diagnosis}
                    </p>
                  )}
                </div>
              )}

              {/* Rx Symbol & Medication Table */}
              <div className="mb-6">
                <div className="flex items-center gap-1.5 text-teal-800 font-black text-lg mb-2">
                  <span>℞</span>
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-700">Prescribed Medications</span>
                </div>

                <table className="w-full text-left text-xs border border-slate-200">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2 border-r border-slate-200">#</th>
                      <th className="p-2 border-r border-slate-200">Medicine & Strength</th>
                      <th className="p-2 border-r border-slate-200">Dosage</th>
                      <th className="p-2 border-r border-slate-200">Frequency</th>
                      <th className="p-2 border-r border-slate-200">Duration</th>
                      <th className="p-2">Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {prescriptionData.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 border-r border-slate-100 font-medium text-slate-500">{idx + 1}</td>
                        <td className="p-2 border-r border-slate-100 font-bold text-slate-900">
                          {item.medicineName}
                          {item.quantity ? <span className="text-slate-500 font-normal ml-1">(Qty: {item.quantity})</span> : null}
                        </td>
                        <td className="p-2 border-r border-slate-100">{item.dosage || "1 Unit"}</td>
                        <td className="p-2 border-r border-slate-100 font-medium">{item.frequency || "Once daily"}</td>
                        <td className="p-2 border-r border-slate-100">{item.duration || "5 days"}</td>
                        <td className="p-2 text-slate-600 italic">{item.instructions || "After food"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Advice / Doctor Remarks */}
              {prescriptionData.doctorRemarks && (
                <div className="mb-6 rounded-lg bg-teal-50/40 border border-teal-100 p-3 text-xs">
                  <strong className="text-teal-950 font-bold block mb-1">General Care Advice:</strong>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{prescriptionData.doctorRemarks}</p>
                </div>
              )}

              {/* Signatures & Footer */}
              <div className="mt-12 pt-4 border-t border-slate-200 flex justify-between items-end text-xs">
                <div>
                  <p className="text-[11px] text-slate-500">Follow-up as recommended.</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">VetOS Clinical Medical Record — System Authenticated</p>
                </div>
                <div className="text-right">
                  <div className="h-10 border-b border-slate-400 w-44 mb-1"></div>
                  <p className="font-bold text-slate-900">{prescriptionData.doctorName}</p>
                  <p className="text-[10px] text-slate-500 uppercase">Authorized Veterinary Surgeon</p>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* B. INVOICE / RECEIPT SLIP */}
          {/* ============================================================== */}
          {documentType === "INVOICE" && invoiceData && (
            <div
              id="printable-area"
              className={`bg-white p-6 rounded-xl shadow-xs border border-slate-200/90 print:border-none print:shadow-none print:p-0 ${
                thermalMode
                  ? "w-80 text-[11px] font-mono leading-tight"
                  : "w-full max-w-2xl text-xs print:w-full"
              }`}
            >
              {/* Thermal Mode Layout */}
              {thermalMode ? (
                <div className="space-y-2 text-center text-slate-900">
                  <h2 className="font-bold text-sm uppercase">{invoiceData.clinicName || defaultClinicName}</h2>
                  <p className="text-[10px] text-slate-600">{invoiceData.clinicAddress || defaultAddress}</p>
                  <p className="text-[10px] text-slate-600">Tel: {invoiceData.clinicPhone || defaultPhone}</p>
                  <p className="text-[10px] font-bold">{invoiceData.gstin || defaultGstin}</p>
                  <div className="border-b border-dashed border-slate-400 my-1"></div>

                  <div className="text-left text-[10px] space-y-0.5">
                    <div className="flex justify-between">
                      <span>Invoice #:</span>
                      <strong className="font-bold">{invoiceData.invoiceNumber.slice(0, 8)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{invoiceData.invoiceDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Client:</span>
                      <strong className="font-bold">{invoiceData.clientName}</strong>
                    </div>
                    {invoiceData.petName && (
                      <div className="flex justify-between">
                        <span>Patient:</span>
                        <span>{invoiceData.petName}</span>
                      </div>
                    )}
                  </div>
                  <div className="border-b border-dashed border-slate-400 my-1"></div>

                  {/* Items */}
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-300">
                        <th className="py-1">Item</th>
                        <th className="text-center">Qty</th>
                        <th className="text-right">Price</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoiceData.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="py-1 pr-1 truncate max-w-[120px]">{line.description}</td>
                          <td className="text-center py-1">{line.quantity}</td>
                          <td className="text-right py-1">${line.unitPrice.toFixed(2)}</td>
                          <td className="text-right py-1 font-bold">${line.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-b border-dashed border-slate-400 my-1"></div>

                  <div className="text-right text-[10px] space-y-0.5">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>${invoiceData.subtotal.toFixed(2)}</span>
                    </div>
                    {invoiceData.taxAmount > 0 && (
                      <div className="flex justify-between">
                        <span>Tax / GST:</span>
                        <span>${invoiceData.taxAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-800">
                      <span>GRAND TOTAL:</span>
                      <span>${invoiceData.grandTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-1 text-[10px]">
                      <span>Payment Status:</span>
                      <span className="font-bold uppercase text-emerald-700">{invoiceData.paymentStatus}</span>
                    </div>
                    {invoiceData.paymentMethod && (
                      <div className="flex justify-between text-[10px]">
                        <span>Payment Mode:</span>
                        <span>{invoiceData.paymentMethod}</span>
                      </div>
                    )}
                  </div>
                  <div className="border-b border-dashed border-slate-400 my-2"></div>
                  <p className="text-[9px] text-slate-500">Thank you for trusting us with your pet!</p>
                </div>
              ) : (
                /* Standard A4 Formal Invoice */
                <div>
                  <div className="border-b-2 border-slate-800 pb-4 mb-4 flex justify-between items-start">
                    <div>
                      <h1 className="text-lg font-black tracking-tight text-slate-900 uppercase">
                        {invoiceData.clinicName || defaultClinicName}
                      </h1>
                      <p className="text-xs text-slate-600 mt-0.5">{invoiceData.clinicAddress || defaultAddress}</p>
                      <p className="text-[11px] text-slate-500">
                        Tel: {invoiceData.clinicPhone || defaultPhone} • Email: {invoiceData.clinicEmail || defaultEmail}
                      </p>
                      <p className="text-[10px] font-bold text-slate-600 mt-0.5">{invoiceData.gstin || defaultGstin}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block rounded-md bg-emerald-50 border border-emerald-300 px-2 py-0.5 text-xs font-bold text-emerald-800 uppercase">
                        TAX INVOICE
                      </span>
                      <p className="text-xs text-slate-700 font-bold mt-1.5">
                        Invoice #: <span className="font-mono">{invoiceData.invoiceNumber.slice(0, 13)}</span>
                      </p>
                      <p className="text-xs text-slate-500">Date: {invoiceData.invoiceDate}</p>
                    </div>
                  </div>

                  {/* Billed To */}
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs border border-slate-200/80 mb-5">
                    <div>
                      <span className="text-slate-500">Billed To:</span>{" "}
                      <strong className="text-slate-900 block text-sm">{invoiceData.clientName}</strong>
                      {invoiceData.clientPhone && <p className="text-slate-600 text-[11px]">Phone: {invoiceData.clientPhone}</p>}
                    </div>
                    <div className="text-right">
                      {invoiceData.petName && (
                        <div>
                          <span className="text-slate-500">Patient:</span>{" "}
                          <strong className="text-slate-900">{invoiceData.petName}</strong>
                        </div>
                      )}
                      <div className="mt-1">
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase bg-emerald-100 text-emerald-800">
                          Status: {invoiceData.paymentStatus}
                        </span>
                        {invoiceData.paymentMethod && (
                          <span className="text-slate-600 text-[11px] ml-2">({invoiceData.paymentMethod})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Lines Table */}
                  <table className="w-full text-left text-xs border border-slate-200 mb-6">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 border-r border-slate-200">#</th>
                        <th className="p-2 border-r border-slate-200">Description / Service / Product</th>
                        <th className="p-2 border-r border-slate-200 text-center">Qty</th>
                        <th className="p-2 border-r border-slate-200 text-right">Unit Price</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {invoiceData.lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 border-r border-slate-100 text-slate-500">{idx + 1}</td>
                          <td className="p-2 border-r border-slate-100 font-semibold">{line.description}</td>
                          <td className="p-2 border-r border-slate-100 text-center">{line.quantity}</td>
                          <td className="p-2 border-r border-slate-100 text-right">${line.unitPrice.toFixed(2)}</td>
                          <td className="p-2 text-right font-bold text-slate-900">${line.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Calculations */}
                  <div className="flex justify-end mb-8">
                    <div className="w-64 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal:</span>
                        <span className="font-semibold">${invoiceData.subtotal.toFixed(2)}</span>
                      </div>
                      {invoiceData.taxAmount > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Tax / GST:</span>
                          <span className="font-semibold">${invoiceData.taxAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                        <span>Net Payable:</span>
                        <span className="text-teal-800 font-black text-base">${invoiceData.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-end text-xs">
                    <div>
                      <p className="text-[11px] text-slate-500">Computer generated tax invoice. No signature required.</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">VetOS Billing Counter Station</p>
                    </div>
                    <div className="text-right">
                      <div className="h-8 border-b border-slate-400 w-36 mb-1"></div>
                      <p className="text-[11px] font-bold text-slate-700">Cashier / Billing In-Charge</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
