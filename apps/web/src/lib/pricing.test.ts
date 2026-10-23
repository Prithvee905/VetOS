import { describe, expect, it } from "vitest";
import { gstOf, lineGst } from "./pricing";

describe("GST pricing", () => {
  it("splits an MRP price into taxable value and GST like the server", () => {
    expect(lineGst(1500, 0.12, true)).toEqual({ taxable: 1339.29, tax: 160.71, total: 1500 });
  });

  it("adds GST on top when prices exclude tax", () => {
    expect(lineGst(1000, 0.18, false)).toEqual({ taxable: 1000, tax: 180, total: 1180 });
  });

  it("turns a catalog percentage into an invoice fraction", () => {
    expect(gstOf({ gstRate: 12, hsnCode: "3004" })).toEqual({ taxRate: 0.12, hsnSac: "3004" });
    expect(gstOf(undefined)).toEqual({ taxRate: 0 });
  });
});
