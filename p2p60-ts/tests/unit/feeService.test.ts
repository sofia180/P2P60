import { describe, expect, it } from "vitest";
import { calculateFee } from "../../src/services/feeService.js";

describe("feeService", () => {
  it("calculates maker fee", () => {
    const fee = calculateFee(1000, true);
    expect(fee).toBeGreaterThan(0);
  });
});
