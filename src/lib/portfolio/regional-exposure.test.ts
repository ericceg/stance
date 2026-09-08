import { describe, expect, it } from "vitest";
import { parseIsharesGeographicExposure, parseVanguardMarketAllocation } from "./regional-exposure-parser";

describe("parseVanguardMarketAllocation", () => {
  it("groups country rows into portfolio regions", () => {
    const html = `<h5>Market allocation</h5><p>As at 31 Jul 2026</p><table>
      <tr><td>United States</td><td>North America</td><td class="numeric"> 61.62% </td><td>61%</td></tr>
      <tr><td>Canada</td><td>North America</td><!-- server marker --><td class="numeric">2.98%</td><td>3%</td></tr>
      <tr><td>Japan</td><td>Pacific</td><td class="numeric">5.96%</td><td>6%</td></tr>
    </table>`;
    expect(parseVanguardMarketAllocation(html)).toEqual({
      exposures: [
        { region: "North America", weight: 64.6 },
        { region: "Pacific", weight: 5.96 },
      ],
      asOf: new Date("2026-07-31T12:00:00.000Z"),
    });
  });

  it("returns null when the expected issuer section is absent", () => {
    expect(parseVanguardMarketAllocation("<html></html>")).toBeNull();
  });
});

describe("parseIsharesGeographicExposure", () => {
  it("reads and groups the issuer's structured country exposure", () => {
    const props = JSON.stringify({ containersByNameMap: { geography: { subContainersByNameMap: { countries: { dataPointsByNameMap: {
      asOf: { value: 20260904 },
      code: { value: ["US", "CA", "JP", "GB", "OTHR", "CASHD_C"] },
      fund: { value: [72.12, 3.44, 5.84, 3.46, 4.87, 0.27] },
    } } } } } });
    const encoded = props.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<walrus-render-on-client componenttype="on-server-first" componentprops="${encoded}" componentkey="exposureBreakdowns"></walrus-render-on-client>`;
    expect(parseIsharesGeographicExposure(html)).toEqual({
      exposures: [
        { region: "North America", weight: 75.56 },
        { region: "Pacific", weight: 5.84 },
        { region: "Europe", weight: 3.46 },
        { region: "Other", weight: 5.14 },
      ],
      asOf: new Date("2026-09-04T12:00:00.000Z"),
    });
  });
});
