import { describe, expect, it } from "vitest";
import { parseCsv, parseDegiroCsv, parseLocalizedNumber } from "./degiro";

describe("DEGIRO CSV parser", () => {
  it("parses quoted delimiters and localized numbers", () => {
    expect(parseCsv('Name,Description\nVWCE,"A fund, with commas"')).toEqual([
      ["Name", "Description"],
      ["VWCE", "A fund, with commas"],
    ]);
    expect(parseLocalizedNumber("1.234,56")).toBe(1234.56);
    expect(parseLocalizedNumber("-2'450.75")).toBe(-2450.75);
  });

  it("normalizes transaction statement trades and derives CHF values", () => {
    const csv = [
      '"Date","Time","Product","ISIN","Reference","Venue","Quantity","Price","","Local value","","Value","","Exchange rate","Transaction and/or third party fees","","Total","","Order ID"',
      '"30-12-2025","14:48","Vanguard FTSE All-World","IE00BK5BQT80","VWCE","XET","2","92.66","EUR","185.32","EUR","177.91","CHF","1.0417","-2.08","CHF","-179.99","CHF","order-1"',
      '"04-01-2026","10:02","Vanguard FTSE All-World","IE00BK5BQT80","VWCE","XET","-1","100","EUR","-100","EUR","98","CHF","1.0204","-1","CHF","97","CHF","order-2"',
    ].join("\n");

    const result = parseDegiroCsv(csv, { accountBaseCurrency: "CHF" });
    expect(result.kind).toBe("transactions");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      type: "BUY",
      quantity: 2,
      executionPrice: 92.66,
      transactionCurrency: "EUR",
      totalValue: 185.32,
      totalValueChf: 177.91,
      feeChf: 2.08,
    });
    expect(result.rows[1].type).toBe("SELL");
  });

  it("imports supported account movements and ignores trade settlement noise", () => {
    const csv = [
      '"Date","Time","Value date","Product","ISIN","Description","FX","Change","","Balance","","Order Id"',
      '"02-01-2026","09:00","02-01-2026","","","Deposit","","EUR","1000","EUR","1000",""',
      '"03-01-2026","09:00","03-01-2026","ACME","US0000000001","Dividend","","EUR","12","EUR","1012",""',
      '"04-01-2026","09:00","04-01-2026","ACME","US0000000001","Buy 2 ACME","","EUR","-50","EUR","962","order-3"',
      '"05-01-2026","09:00","05-01-2026","","","Exchange Connection Fee","","EUR","-2.5","EUR","959.5",""',
    ].join("\n");

    const result = parseDegiroCsv(csv, { accountBaseCurrency: "EUR" });
    expect(result.kind).toBe("account");
    expect(result.rows.map((row) => row.type)).toEqual(["DEPOSIT", "DIVIDEND", "FEE"]);
    expect(result.ignoredRows).toBe(1);
    expect(result.rows[0].totalValueChf).toBeNull();
  });

  it("imports DEGIRO capital repayments, rebates, and exchange-access fees", () => {
    const csv = [
      '"Date","Time","Description","Change",""',
      '"24-07-2026","07:08","Kapitalrückzahlung","CHF","5.04"',
      '"23-04-2024","06:54","Rabatt für Aktion","EUR","4.00"',
      '"04-08-2026","14:22","Einrichtung von Handelsmodalitäten 2026 (Societe Generale OTC - SCG)","EUR","-2.50"',
    ].join("\n");

    const result = parseDegiroCsv(csv, { accountBaseCurrency: "CHF" });

    expect(result.rows.map((row) => row.type)).toEqual(["DIVIDEND", "DIVIDEND", "FEE"]);
    expect(result.ignoredRows).toBe(0);
  });

  it("extracts priced trades and their CHF conversion from an account statement", () => {
    const csv = [
      '"Date","Time","Value date","Product","ISIN","Description","FX","Change","","Balance","","Order Id"',
      '"29-07-2026","17:17","29-07-2026","ETF","IE00BKM4GZ66","Währungswechsel (Einbuchung)","1.0689","EUR","189.12","EUR","0.00","order-1"',
      '"29-07-2026","17:17","29-07-2026","ETF","IE00BKM4GZ66","Währungswechsel (Ausbuchung)","","CHF","-176.93","CHF","904.53","order-1"',
      '"29-07-2026","17:17","29-07-2026","ETF","IE00BKM4GZ66","DEGIRO Transaktionsgebühren und/oder Fremdkosten","","CHF","-0.47","CHF","1081.46","order-1"',
      '"29-07-2026","17:17","29-07-2026","ETF","IE00BKM4GZ66","Kauf 12 zu je 15.76 EUR (IE00BKM4GZ66)","","EUR","-189.12","EUR","-189.12","order-1"',
    ].join("\n");

    const result = parseDegiroCsv(csv, { accountBaseCurrency: "CHF" });
    expect(result.rows).toHaveLength(2);
    expect(result.ignoredRows).toBe(2);
    expect(result.rows[1]).toMatchObject({
      type: "BUY",
      quantity: 12,
      executionPrice: 15.76,
      transactionCurrency: "EUR",
      totalValue: 189.12,
      totalValueChf: 176.93,
    });
    expect(result.rows[1].fxRateToChf).toBeCloseTo(176.93 / 189.12);
  });

  it("accepts older account exports with the amount before its currency", () => {
    const csv = [
      '"Date","Time","Description","Change",""',
      '"02-01-2026","09:00","Einzahlung","100","CHF"',
    ].join("\n");

    const result = parseDegiroCsv(csv, { accountBaseCurrency: "CHF" });
    expect(result.rows[0]).toMatchObject({
      type: "DEPOSIT",
      totalValue: 100,
      transactionCurrency: "CHF",
    });
  });

  it("ignores DEGIRO cash-sweep bank movements", () => {
    const csv = [
      '"Date","Time","Description","Change",""',
      '"02-01-2026","09:00","Auszahlung","CHF","-100"',
      '"02-01-2026","09:01","Auszahlung von Ihrem Geldkonto bei der flatexDEGIRO Bank: 100 CHF","",""',
      '"02-01-2026","09:01","Degiro Cash Sweep Transfer","CHF","100"',
    ].join("\n");

    const result = parseDegiroCsv(csv, { accountBaseCurrency: "CHF" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].type).toBe("WITHDRAWAL");
    expect(result.ignoredRows).toBe(2);
  });
});
