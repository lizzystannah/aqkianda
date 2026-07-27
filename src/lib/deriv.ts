import { getDerivSymbol } from "./market";
import { useStore } from "./store";
import { getDynamicExecutionLimits } from "./executionLimits";

const DERIV_REST_BASE = "https://api.derivws.com/trading/v1/options";
const DERIV_WS_PUBLIC = "wss://api.derivws.com/trading/v1/options/ws/public";

export class DerivAPI {

  ws: WebSocket | null = null;
  token: string | null = null;
  appId = "33A1AlzgBDkHZ0IDv11st";
  public accountType: "demo" | "real" = "demo";
  /** Currency for proposals: "USD" for demo, "USDT" for real */
  public currency: string = "USD";

  onTick: ((tick: { quote: number, epoch: number, symbol: string }) => void) | null = null;
  onOpenContract: ((contract: Record<string, unknown>) => void) | null = null;
  onBalance: ((balance: number) => void) | null = null;
  onLatency: ((ms: number) => void) | null = null;
  
  private reqId = 1;
  private reqMap: Record<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }> = {};

  private readyResolver: (() => void) | null = null;
  public readyPromise: Promise<void> | null = null;

  // Keep track of subscribed assets to automatically resubscribe on reconnect
  private subscribedAssets: Set<string> = new Set();

  /** REST API call to the new Deriv API */
  private async restFetch(path: string, method: string = "GET"): Promise<any> {
    if (!this.token) throw new Error("No token for REST API call");
    const res = await fetch(`${DERIV_REST_BASE}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Deriv-App-ID": this.appId,
        "Content-Type": "application/json"
      }
    });
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.errors?.[0]?.message || `REST error ${res.status}`;
      throw new Error(errMsg);
    }
    return data;
  }

  /** Get authenticated WebSocket URL via OTP */
  private async getOTPUrl(): Promise<string> {
    const accountsData = await this.restFetch("/accounts");
    const accounts: any[] = accountsData?.data || [];
    const account = accounts.find((a: any) => a.account_type === this.accountType);
    if (!account) throw new Error(`No ${this.accountType} account found for token`);
    // Use the actual account currency from Deriv instead of hardcoded fallback
    if (account.currency && account.currency !== this.currency) {
      console.log(`[DerivAPI:${this.name}] Account currency updated: "${this.currency}" → "${account.currency}"`);
      this.currency = account.currency;
    }
    const otpData = await this.restFetch(`/accounts/${account.account_id}/otp`, "POST");
    const url: string = otpData?.data?.url;
    if (!url) throw new Error("OTP response missing WebSocket URL");
    return url;
  }

  async connect(token?: string) {
    const newToken = token || this.token;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.token === newToken) {
        return; // same token, already connecting or connected
      }
      // token changed, close old connection
      this.ws.onclose = null;
      this.ws.close();
    }

    this.token = newToken;

    this.readyPromise = new Promise(resolve => {
      this.readyResolver = resolve;
    });

    let wsUrl: string;
    if (newToken) {
      try {
        wsUrl = await this.getOTPUrl();
      } catch (e) {
        console.error("[DerivAPI] Failed to get OTP URL:", e);
        throw e;
      }
    } else {
      wsUrl = DERIV_WS_PUBLIC;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[DerivAPI] Connected", newToken ? "(authenticated via OTP)" : "(public)");
      // New API: no authorize message needed
      this.send({ balance: 1, subscribe: 1 }).catch(() => {});
      this.send({ proposal_open_contract: 1, subscribe: 1 }).catch(() => {});

      // Resubscribe to ticks if this was a reconnection
      for (const symbol of this.subscribedAssets) {
        this.send({ ticks: symbol, subscribe: 1 }).catch(() => {});
      }

      if (this.readyResolver) {
        this.readyResolver();
        this.readyResolver = null;
      }
      this.startPing();
    };
    
    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.req_id && this.reqMap[data.req_id]) {
        if (data.error) this.reqMap[data.req_id].reject(data.error);
        else this.reqMap[data.req_id].resolve(data);
        delete this.reqMap[data.req_id];
      }
      
      if (data.msg_type === 'tick') {
        if (this.onTick) this.onTick(data.tick);
      }
      if (data.msg_type === 'proposal_open_contract') {
        if (this.onOpenContract && data.proposal_open_contract) {
          this.onOpenContract(data.proposal_open_contract);
        }
      }
      if (data.msg_type === 'balance') {
        if (this.onBalance && data.balance && data.balance.balance !== undefined) {
          this.onBalance(data.balance.balance);
        }
      }
    };
    
    this.ws.onclose = () => {
      console.log("Deriv WS Disconnected. Reconnecting...");
      setTimeout(() => this.connect(this.token || undefined), 5000);
    };
  }
  
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const start = Date.now();
        this.send({ ping: 1 }).then(() => {
          const ms = Date.now() - start;
          if (this.onLatency) this.onLatency(ms);
          try {
            useStore.getState().setLocalLatency(ms);
          } catch (_) { /* ignore */ }
        }).catch(() => {});
      }
    }, 5000);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(payload: Record<string, unknown>): Promise<any> {
    let attempt = 0;
    const maxAttempts = 6;
    let delay = 1500; // start with 1.5s delay on rate limit

    while (attempt < maxAttempts) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        if (this.readyPromise) {
          await this.readyPromise;
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WS not connected");
        }
      }

      try {
        const result = await new Promise((resolve, reject) => {
          const id = this.reqId++;
          this.reqMap[id] = { resolve, reject };
          this.ws!.send(JSON.stringify({ ...payload, req_id: id }));
        });
        return result;
      } catch (err: any) {
        const errMessage = err?.message || String(err);
        const isRateLimit = errMessage.toLowerCase().includes("rate limit") || 
                            errMessage.toLowerCase().includes("ratelimit") || 
                            (err?.code && String(err.code).toLowerCase().includes("rate"));

        if (isRateLimit && attempt < maxAttempts - 1) {
          attempt++;
          console.warn(`[DerivAPI:Client] ⚠️ Rate limit hit for payload: ${JSON.stringify(payload).substring(0, 150)}. Retrying in ${delay}ms... (Attempt ${attempt}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
          continue;
        }
        throw err;
      }
    }
  }

  async subscribeTicks(symbol: string) {
    const derivSym = getDerivSymbol(symbol);
    this.subscribedAssets.add(derivSym);
    await this.send({ ticks: derivSym, subscribe: 1 });
  }

  async getCandles(symbol: string, count: number, granularity: number, end: string | number = "latest") {
    const derivSym = getDerivSymbol(symbol);
    
    if (count <= 5000) {
      const res = await this.send({
        ticks_history: derivSym,
        adjust_start_time: 1,
        count,
        end,
        style: "candles",
        granularity
      });
      return res.candles;
    }

    // Batching logic for count > 5000
    console.log(`[DerivAPI] Fetching ${count} candles in batches for ${symbol}...`);
    let remaining = count;
    let currentEnd = end;
    const allCandles: any[] = [];

    while (remaining > 0) {
      const batchSize = Math.min(remaining, 5000);
      try {
        const res = await this.send({
          ticks_history: derivSym,
          adjust_start_time: 1,
          count: batchSize,
          end: currentEnd,
          style: "candles",
          granularity
        });

        if (!res.candles || res.candles.length === 0) break;

        // Add to front of list (older data comes from earlier iterations if we go backwards)
        // Actually ticks_history with count and end="latest" returns the 5000 candles BEFORE end.
        // They are returned in chronological order: [oldest, ..., newest]
        const batch = res.candles;
        allCandles.unshift(...batch);

        remaining -= batch.length;
        if (remaining <= 0) break;

        // Find oldest epoch regardless of API return order
        let oldestEpoch = batch[0].epoch;
        for (let i = 1; i < batch.length; i++) {
          if (batch[i].epoch < oldestEpoch) oldestEpoch = batch[i].epoch;
        }
        currentEnd = oldestEpoch - 1;

        // Stagger batch queries to avoid spamming the connection and triggering Deriv rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`[DerivAPI:Client] Batch fetch error for ${symbol}:`, err);
        break;
      }
    }

    // Since we unshifted, the order is correct?
    // Batch 1: [T-5000, ..., T] -> unshift -> allCandles: [T-5000, ..., T]
    // Batch 2: [T-10000, ..., T-5001] -> unshift -> allCandles: [T-10000, ..., T-5001, T-5000, ..., T]
    // Correct!
    return allCandles;
  }

  async copyStart() {
    // maybe sub to open contracts
  }

  async buyContract(symbol: string, amount: number, contractType: "CALL" | "PUT" | "BUY" | "SELL", duration: number, durationUnit = "s", passthrough?: any) {
    const derivSym = getDerivSymbol(symbol);
    const isEpoch = duration > 1000000000;
    const isForex = derivSym.startsWith("frx");

    const tf = passthrough?.timeframe || "1m";
    const limits = getDynamicExecutionLimits(tf, duration, durationUnit);

    // Map BUY/SELL to CALL/PUT (forex strategies emit BUY/SELL, but Deriv binary API uses CALL/PUT)
    const derivType: "CALL" | "PUT" = (contractType === "BUY" || contractType === "CALL") ? "CALL" : "PUT";

    // Direct Buy Optimization: Send single `buy: 1` request with `parameters`
    const directBuyParams: Record<string, any> = {
      amount,
      basis: "stake",
      contract_type: derivType,
      currency: this.currency,
      underlying_symbol: derivSym
    };

    if (isEpoch) {
      directBuyParams.date_expiry = duration;
    } else {
      directBuyParams.duration = duration;
      directBuyParams.duration_unit = isForex && durationUnit === "s" ? "m" : durationUnit;
    }

    const directBuyPayload: Record<string, any> = {
      buy: "1",
      price: amount,
      parameters: directBuyParams
    };

    if (passthrough) {
      directBuyPayload.passthrough = passthrough;
    }

    try {
      const directRes = await this.send(directBuyPayload);
      if (directRes?.buy?.contract_id) {
        return directRes.buy;
      }
    } catch (_e) {
      // Fallback to 2-step proposal if direct buy parameters are rejected
    }

    const proposalPayload: Record<string, any> = {
      proposal: 1,
      amount,
      basis: "stake",
      contract_type: derivType,
      currency: this.currency,
      underlying_symbol: derivSym
    };

    if (isEpoch) {
      proposalPayload.date_expiry = duration;
    } else {
      proposalPayload.duration = duration;
      // Forex uses minutes by default instead of seconds
      proposalPayload.duration_unit = isForex && durationUnit === "s" ? "m" : durationUnit;
    }

    if (passthrough) {
      proposalPayload.passthrough = passthrough;
    }

    // 1. Get proposal
    const proposalRes = await this.send(proposalPayload);

    if (proposalRes.proposal && proposalRes.proposal.id) {
      // 2. Buy
      const buyPayload: Record<string, any> = {
        buy: proposalRes.proposal.id,
        price: amount
      };
      if (passthrough) {
        buyPayload.passthrough = passthrough;
      }
      const buyRes = await this.send(buyPayload);
      return buyRes.buy;
    }
  }

  async sellContract(contractId: number, price: number = 0) {
    const res = await this.send({
      sell: contractId,
      price: Math.max(0, price)
    });
    return res.sell;
  }

  disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
  async getProfitTable(limit = 10) {
    const res = await this.send({
      profit_table: 1,
      description: 1,
      limit
    });
    return res.profit_table;
  }

  // ─── MT5 / Forex CFD API ────────────────────────────────────────────

  private mt5LoginId: string | null = null;
  onMt5Balance: ((balance: number, equity: number, margin: number) => void) | null = null;

  get mt5Connected(): boolean {
    return this.mt5LoginId !== null;
  }

  async mt5Login(loginId: string, password: string) {
    const res = await this.send({
      mt5_login: 1,
      login: loginId,
      password
    });
    if (res.error) throw new Error(res.error.message || "MT5 login failed");
    this.mt5LoginId = loginId;
    console.log(`[DerivAPI] ✅ MT5 logged in (login: ${loginId})`);
    return res;
  }

  async mt5Logout() {
    this.mt5LoginId = null;
  }

  async mt5GetSettings() {
    if (!this.mt5LoginId) throw new Error("MT5 not logged in");
    const res = await this.send({
      mt5_get_settings: 1,
      login: this.mt5LoginId
    });
    if (res.error) throw new Error(res.error.message || "MT5 get settings failed");
    return res.mt5_get_settings;
  }

  async mt5CreateOrder(symbol: string, action: "BUY" | "SELL", volume: number, stopLoss = 0, takeProfit = 0) {
    if (!this.mt5LoginId) throw new Error("MT5 not logged in");
    const derivSym = getDerivSymbol(symbol);
    const res = await this.send({
      mt5_order: 1,
      mt5: {
        login: this.mt5LoginId,
        symbol: derivSym,
        action,
        volume, // lot size (0.1 = 0.1 lot)
        type: 0, // 0 = market order
        price: 0, // 0 for market
        stop_loss: stopLoss,
        take_profit: takeProfit
      }
    });
    if (res.error) throw new Error(res.error.message || "MT5 order failed");
    return res;
  }

  async mt5CloseOrder(orderId: number) {
    if (!this.mt5LoginId) throw new Error("MT5 not logged in");
    const res = await this.send({
      mt5_order: 1,
      mt5: {
        login: this.mt5LoginId,
        order: orderId,
        action: "CLOSE"
      }
    });
    if (res.error) throw new Error(res.error.message || "MT5 close order failed");
    return res;
  }

  async mt5GetPositions() {
    if (!this.mt5LoginId) throw new Error("MT5 not logged in");
    const res = await this.send({
      mt5_get_positions: 1,
      login: this.mt5LoginId
    });
    if (res.error) throw new Error(res.error.message || "MT5 get positions failed");
    return res.positions || [];
  }

  // Subscribe to MT5 balance updates
  async mt5SubscribeBalance() {
    if (!this.mt5LoginId) throw new Error("MT5 not logged in");
    await this.send({
      mt5_login: 1,
      login: this.mt5LoginId,
      subscribe: 1
    });
  }
}

export const derivAPI = new DerivAPI();
