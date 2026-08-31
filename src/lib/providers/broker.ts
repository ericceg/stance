export interface BrokerAccountSnapshot {
  externalAccountId: string;
  baseCurrency: string;
}

export interface BrokerCashBalance {
  currency: string;
  amount: number;
}

export interface BrokerPositionRecord {
  externalSecurityId?: string;
  isin?: string;
  ticker?: string;
  quantity: number;
}

export interface BrokerTransactionRecord {
  externalId: string;
  occurredAt: Date;
  type: string;
  isin?: string;
  ticker?: string;
  quantity?: number;
  price?: number;
  currency: string;
  fee?: number;
  totalValue: number;
}

export interface BrokerDividendRecord extends BrokerTransactionRecord {
  type: "DIVIDEND";
}

/** Read-only by design. Trade placement is intentionally absent from this contract. */
export interface BrokerProvider {
  readonly name: string;
  getAccount(): Promise<BrokerAccountSnapshot>;
  getCash(): Promise<BrokerCashBalance[]>;
  getPositions(): Promise<BrokerPositionRecord[]>;
  getTransactions(): Promise<BrokerTransactionRecord[]>;
  getDividends(): Promise<BrokerDividendRecord[]>;
}

export class MockTrading212Provider implements BrokerProvider {
  readonly name = "Trading 212 (mock)";

  async getAccount(): Promise<BrokerAccountSnapshot> {
    return { externalAccountId: "fictional-demo-account", baseCurrency: "CHF" };
  }

  async getCash() { return [{ currency: "CHF", amount: 0 }]; }
  async getPositions() { return []; }
  async getTransactions() { return []; }
  async getDividends() { return []; }
}
