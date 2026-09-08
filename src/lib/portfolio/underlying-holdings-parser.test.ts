import { describe, expect, it } from "vitest";
import { parseVanguardUnderlyingHoldings } from "./underlying-holdings-parser";

describe("parseVanguardUnderlyingHoldings", () => {
  it("reads issuer holding names, weights, and date", () => {
    const html = `<h5>Holdings details</h5><p>As at 31 Jul 2026</p><table><tr><td>NVIDIA Corp</td><td>4.44300%</td></tr><tr><td>Apple Inc</td><td>4.23463%</td></tr></table>`;
    expect(parseVanguardUnderlyingHoldings(html)).toEqual({
      holdings: [{ ticker: "NVIDIA-CORP-1", name: "NVIDIA Corp", weight: 4.443 }, { ticker: "APPLE-INC-1", name: "Apple Inc", weight: 4.23463 }],
      asOf: new Date("2026-07-31T12:00:00.000Z"),
    });
  });

  it("returns null when there is no holding table", () => {
    expect(parseVanguardUnderlyingHoldings("<html></html>")).toBeNull();
  });
});
