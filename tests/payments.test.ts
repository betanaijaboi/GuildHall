import { describe, expect, it } from "vitest";
import { contractHash, renderContract, type ContractTerms } from "@/lib/contracts";
import { contractFeeCents, FLAT_FEE_CENTS, formatMoney, milestoneFees, parseMoney, recommendedModel } from "@/lib/fees";

describe("fees", () => {
  it("takes 6% from the payout on the percent model", () => {
    expect(milestoneFees(60000, "percent")).toEqual({ clientPays: 60000, platformFee: 3600, makerReceives: 56400 });
  });
  it("leaves the maker 100% on the flat model, with one flat fee per contract", () => {
    expect(milestoneFees(60000, "flat")).toEqual({ clientPays: 60000, platformFee: 0, makerReceives: 60000 });
    expect(contractFeeCents("flat", true)).toBe(FLAT_FEE_CENTS);
    expect(contractFeeCents("flat", false)).toBe(0);
    expect(contractFeeCents("percent", true)).toBe(0);
  });
  it("recommends flat for larger contracts", () => {
    expect(recommendedModel(20_000)).toBe("percent");
    expect(recommendedModel(2_000_000)).toBe("flat");
  });
  it("validates money", () => {
    expect(parseMoney("£1,800.50")).toBe(180050);
    expect(() => parseMoney("-5")).not.toThrow();
    expect(() => parseMoney("12.345")).toThrow();
    expect(() => milestoneFees(0, "percent")).toThrow();
    expect(formatMoney(180050, "gbp")).toBe("£1,800.50");
  });
});

describe("contracts", () => {
  const terms: ContractTerms = {
    kind: "work_for_hire", projectName: "Tidebound", clientName: "Amara", makerName: "Lukas", roleTitle: "Environment artist",
    scope: "Three modular harbour kits.", currency: "gbp", milestones: [{ title: "Dock kit", amountCents: 60000 }],
    revsharePercent: null, ipAssignment: "assign_on_payment", credit: "Environment Art", portfolioRights: true, confidentiality: true,
  };
  it("renders IP, payment and credit terms", () => {
    const text = renderContract(terms);
    expect(text).toContain("Work-for-hire agreement");
    expect(text).toContain("Dock kit — £600.00");
    expect(text).toContain("assigned to the Client when the milestone that covers it is paid");
    expect(text).toContain('credited as: "Environment Art"');
    expect(text).toContain("not legal advice");
  });
  it("hash changes with any edit", () => {
    expect(contractHash(renderContract(terms))).not.toBe(contractHash(renderContract({ ...terms, credit: "Art" })));
  });
  it("renders rev-share terms without payments", () => {
    const text = renderContract({ ...terms, kind: "revshare", revsharePercent: 12, milestones: [{ title: "Vertical slice", amountCents: null }] });
    expect(text).toContain("12% of the Project's net revenue");
    expect(text).not.toContain("funds each milestone");
  });
});
