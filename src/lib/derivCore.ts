import { getDerivSymbol } from "./market";
import { getDynamicExecutionLimits } from "./executionLimits";
let WS_CTOR: any = typeof window !== "undefined" ? window.WebSocket : null;

const DERIV_REST_BASE = "https://api.derivws.com/trading/v1/options";
const DERIV_WS_PUBLIC = "wss://api.derivws.com/trading/v1/options/ws/public";


async function getWS() {
  if (WS_CTOR) return WS_CTOR;
  // Dynamic import for Node.js environment
  const mod = await import("ws");
  WS_CTOR = mod.default;
  return WS_CTOR;
}

export class DerivAPI {
  ws: WebSocket | null = null;
  token: string | null = null;
  appId = "33A1AlzgBDkHZ0IDv11st";
  public name: string = "API";
  /** Token provided at first connect — preserved across reconnections */
  private _initialToken: string | null = null;
  /** Demo or real account type for OTP selection */
  public accountType: "demo" | "real" = "demo";
  /** Currency for proposals: "USD" for demo, "USDT" for real */
  public currency: string = "USD";
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  public clearInitialToken(): void {
    this._initialToken = null;
    this.token = null;
  }

  /** REST API call to the new Deriv API */
  private async restFetch(path: string, method: string = "GET"): Promise<any> {
    const token = this._initialToken || this.token;
    if (!token) throw new Error("No token for REST API call");
    const res = await fetch(`${DERIV_REST_BASE}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Deriv-App-ID": this.appId,
        "Content-Type": "application/json"
      }
    });
    // Check if response is JSON before parsing
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      const text = await res.text();
      const snippet = text.substring(0, 100).replace(/\n/g, " ");
      throw new Error(`Deriv API returned ${ct} (status ${res.status}): "${snippet}"`);
    }
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.errors?.[0]?.message || `REST error ${res.status}`;
      throw new Error(errMsg);
    }
    return data;
  }

  /** Get authenticated WebSocket URL via OTP — caches result */
  private async getOTPUrl(): Promise<string> {
    const accountsData = await this.restFetch("/accounts");
    const accounts: any[] = accountsData?.data || [];
    const account = accounts.find((a: any) => a.account_type === this.accountType);
    if (!account) {
      throw new Error(`No ${this.accountType} account found for token`);
    }
    // Use the actual account currency from Deriv instead of hardcoded fallback
    if (account.currency && account.currency !== this.currency) {
      console.log(`[DerivAPI:${this.name}] Account currency updated: "${this.currency}" → "${account.currency}"`);
      this.currency = account.currency;
    }
    const otpData = await this.restFetch(`/accounts/${account.account_id}/otp`, "POST");
    const url: string = otpData?.data?.url;
    if (!url) throw new Error("OTP response missing WebSocket URL");
    this._cachedOTPUrl = url;
    return url;
  }

  /** Refresh OTP URL in background every 60s so we always have a fresh one */
  private startOTPRefresh(): void {
    if (this._otpRefreshInterval) clearInterval(this._otpRefreshInterval);
    this._otpRefreshInterval = setInterval(() => {
      if (this._initialToken) {
        this.getOTPUrl().catch(() => { /* silent refresh failure — will retry in 60s */ });
      }
    }, 60_000);
  }

  onTick: ((tick: { quote: number, epoch: number, symbol: string }) => void) | null = null;
  onOpenContract: ((contract: Record<string, unknown>) => void) | null = null;
  onBalance: ((balance: number) => void) | null = null;
  onLatency: ((ms: number) => void) | null = null;

  private reqId = 1;
  private reqMap: Record<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }> = {};

  private readyResolver: (() => void) | null = null;
  private readyRejecter: ((err: any) => void) | null = null;
  public readyPromise: Promise<void> | null = null;

  // ─── Keep-alive / OTP cache / Reconnect ──────────────────────────────
  private _cachedOTPUrl: string | null = null;
  private _otpRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private _lastPongMs = 0;
  private _zombieCheckInterval: ReturnType<typeof setInterval> | null = null;
  private subscribedAssets: Set<string> = new Set();
  private _reconnectAttempt = 0;
  private _maxBackoff = 60_000;
  /** Track subscribed tick symbols for auto-resubscription on reconnect */
  private subscribedAssets: Set<string> = new Set();

  async connect(token?: string): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // On first connect, store the token permanently for reconnections
    if (token && !this._initialToken) {
      this._initialToken = token;
    }
    const useToken = token || this._initialToken || null;

    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === 0)) {
      const isSameToken = this.token === useToken;
      if (isSameToken) {
        return this.readyPromise || Promise.resolve();
      }
      // Token changed, close old connection
      this.ws.onclose = null;
      this.ws.onerror = () => { };
      try { this.ws.close(); } catch (e) { /* empty */ }
    }

    this.token = useToken;

    // Ensure we have a pending readyPromise if we are starting a connection
    if (!this.readyPromise || !this.readyResolver) {
      this.readyPromise = new Promise((resolve, reject) => {
        this.readyResolver = resolve;
        this.readyRejecter = reject;
      });
    }

    try {
      const WS = await getWS();

      let wsUrl: string;
      if (useToken) {
        // Use cached OTP URL if available, otherwise fetch fresh one
        if (this._cachedOTPUrl) {
          wsUrl = this._cachedOTPUrl;
          console.log(`[DerivAPI:${this.name}] Using cached OTP URL`);
        } else {
          console.log(`[DerivAPI:${this.name}] Getting OTP URL...`);
          wsUrl = await this.getOTPUrl();
          console.log(`[DerivAPI:${this.name}] Got OTP URL`);
        }
        // Start background OTP refresh (60s interval)
        this.startOTPRefresh();
      } else {
        // No token — connect to public WS (market data only)
        console.log(`[DerivAPI:${this.name}] Connecting to public WebSocket (no token)...`);
        wsUrl = DERIV_WS_PUBLIC;
      }

      console.log(`[DerivAPI:${this.name}] Opening WebSocket connection...`);
      this.ws = new WS(wsUrl);

      this.ws.onopen = () => {
        console.log(`[DerivAPI:${this.name}] Connected ${useToken ? "(authenticated via OTP)" : "(public, no auth)"}`);
        this._reconnectAttempt = 0; // Reset backoff counter
        // New API: no authorize message needed — OTP URL handles auth
        this.send({ balance: 1, subscribe: 1 }, true).catch(() => { });
        this.send({ proposal_open_contract: 1, subscribe: 1 }, true).catch(() => { });
        // Re-subscribe to ticks after reconnection
        for (const symbol of this.subscribedAssets) {
          this.send({ ticks: symbol, subscribe: 1 }, true).catch(() => {});
        }
        this.startPing(15000);
        // Resolve readyPromise — callers can safely trade
        if (this.readyResolver) {
          this.readyResolver();
          this.readyResolver = null;
          this.readyRejecter = null;
        }
      };

      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data as string);
        const rId = data.req_id as number;
        if (rId && this.reqMap[rId]) {
          if (data.error) this.reqMap[rId].reject(data.error);
          else this.reqMap[rId].resolve(data);
          delete this.reqMap[rId];
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

      this.ws.onerror = (err) => {
        console.error(`[DerivAPI:${this.name}] WS Error:`, err);
        // 401 = OTP expirou. Invalida cache para forçar refresh na próxima reconexão
        const errMsg = (err as any)?.message || '';
        if (errMsg.includes('401')) {
          console.warn(`[DerivAPI:${this.name}] OTP expired (401). Invalidating cache for fresh OTP.`);
          this._cachedOTPUrl = null;
          // NOTE: NÃO reseta _reconnectAttempt aqui — senão o backoff nunca funciona
          // e o loop de reconexão fica infinito (0ms sempre).
        }
      };

      this.ws.onclose = () => {
        console.log(`[DerivAPI:${this.name}] Disconnected. Reconnecting...`, this._initialToken ? "(token preserved)" : "(no token!)");

        // Reject current readyPromise so callers don't hang — they will retry via waitForReady
        if (this.readyRejecter) {
          this.readyRejecter(new Error("WS disconnected — reconnecting"));
          this.readyRejecter = null;
          this.readyResolver = null;
        }

        // Create fresh readyPromise for the reconnection attempt
        this.readyPromise = new Promise((resolve, reject) => {
          this.readyResolver = resolve;
          this.readyRejecter = reject;
        });

        for (const reqIdStr in this.reqMap) {
          const rId = Number(reqIdStr);
          this.reqMap[rId].reject(new Error("WS Disconnected and Request Cancelled"));
        }
        this.reqMap = {};

        this._reconnect(this._initialToken);
      };
    } catch (err) {
      console.error(`[DerivAPI:${this.name}] Failed to initialize WebSocket:`, err);
      // Reject current readyPromise so callers don't hang
      if (this.readyRejecter) {
        this.readyRejecter(err);
        this.readyResolver = null;
        this.readyRejecter = null;
      }
      // Create a fresh readyPromise for the reconnection attempt
      this.readyPromise = new Promise((resolve, reject) => {
        this.readyResolver = resolve;
        this.readyRejecter = reject;
      });

      this._reconnect(this._initialToken);
      throw err;
    }

    return this.readyPromise;
  }

  private pingInterval: ReturnType<typeof setInterval> | null = null;

  startPing(interval = 15000) {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this._zombieCheckInterval) clearInterval(this._zombieCheckInterval);

    this._lastPongMs = Date.now();

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        const start = Date.now();
        this.send({ ping: 1 }, true).then(() => {
          this._lastPongMs = Date.now();
          if (this.onLatency) this.onLatency(Date.now() - start);
        }).catch(() => { /* ping error — zombi check will catch it */ });
      }
    }, interval);

    // Every 3s, check if we've missed too many pongs
    this._zombieCheckInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== 1) return;
      // No pong in > 1.5 ping intervals + 5s buffer = connection is zombie
      const threshold = Math.round(interval * 1.5) + 5_000;
      const elapsed = Date.now() - this._lastPongMs;
      if (elapsed > threshold) {
        console.warn(`[DerivAPI:${this.name}] Zombie connection detected (${elapsed}ms no pong). Forcing reconnect.`);
        this.ws.onclose = null; // prevent re-entrant onclose
        try { this.ws.close(); } catch { /* empty */ }
        // Manually trigger reconnect
        this._reconnect(this._initialToken);
      }
    }, 5_000);
  }

  async waitForReady(): Promise<void> {
    const checkReady = () => {
      return !!(this.ws && this.ws.readyState === 1);
    };

    if (checkReady()) {
      return;
    }

    if (this.readyPromise) {
      await this.readyPromise;
    }

    let attempts = 0;
    while (!checkReady() && attempts < 20) {
      if (!this.ws || this.ws.readyState === 3 || this.ws.readyState === 2) {
        console.warn(`[DerivAPI:${this.name}] WebSocket is not connected (state: ${this.ws ? this.ws.readyState : 'null'}). Forcing reconnect...`);
        this.connect().catch(() => {});
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.readyPromise) {
        await this.readyPromise;
      }
      attempts++;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(payload: Record<string, unknown>, bypassReady = false): Promise<any> {
    let attempt = 0;
    const maxAttempts = 6;
    let delay = 1500; // start with 1.5s delay on rate limit

    while (attempt < maxAttempts) {
      if (!bypassReady) {
        await this.waitForReady();
        if (!this.ws || this.ws.readyState !== 1) {
          throw new Error("WS not connected");
        }
      }

      try {
        const result = await new Promise((resolve, reject) => {
          if (!this.ws || this.ws.readyState !== 1) {
            return reject(new Error("WS not connected at time of send"));
          }
          const id = this.reqId++;
          this.reqMap[id] = { resolve, reject };
          this.ws.send(JSON.stringify({ ...payload, req_id: id }));
        });
        return result;
      } catch (err: any) {
        const errMessage = err?.message || String(err);
        const isRateLimit = errMessage.toLowerCase().includes("rate limit") || 
                            errMessage.toLowerCase().includes("ratelimit") || 
                            (err?.code && String(err.code).toLowerCase().includes("rate"));

        if (isRateLimit && attempt < maxAttempts - 1) {
          attempt++;
          console.warn(`[DerivAPI:${this.name}] ⚠️ Rate limit hit for payload: ${JSON.stringify(payload).substring(0, 150)}. Retrying in ${delay}ms... (Attempt ${attempt}/${maxAttempts})`);
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
      const res = await this.sendWithTimeout({
        ticks_history: derivSym,
        adjust_start_time: 1,
        count,
        end,
        style: "candles",
        granularity
      }, 8000);
      return res.candles;
    }

    // Batching logic for count > 5000
    console.log(`[DerivAPI:${this.name}] Fetching ${count} candles in batches for ${symbol}...`);
    let remaining = count;
    let currentEnd = end;
    const allCandles: any[] = [];

    while (remaining > 0) {
      const batchSize = Math.min(remaining, 5000);
      try {
        const res = await this.sendWithTimeout({
          ticks_history: derivSym,
          adjust_start_time: 1,
          count: batchSize,
          end: currentEnd,
          style: "candles",
          granularity
        }, 12000); // slightly increased timeout for safe batch delivery

        if (!res.candles || res.candles.length === 0) break;

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
      } catch (err: any) {
        let errStr = err instanceof Error ? err.message : (err && typeof err === 'object' && 'message' in err) ? err.message : String(err);
        if (errStr && errStr.includes("Sorry, an error occurred")) {
          errStr = "Rejeitado pela Deriv (requer conexão autorizada com Token para obter dados de Volatility Indices/Sintéticos)";
        }
        console.error(`[DerivAPI:${this.name}] Batch fetch error for ${symbol}:`, errStr);
        break;
      }
    }
    return allCandles;
  }

  async copyStart() {
    // maybe sub to open contracts
  }

  async sendWithTimeout(payload: Record<string, unknown>, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      let isDone = false;
      const timeoutId = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          reject(new Error(`Request timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.send(payload)
        .then((res) => {
          if (!isDone) {
            isDone = true;
            clearTimeout(timeoutId);
            resolve(res);
          }
        })
        .catch((err) => {
          if (!isDone) {
            isDone = true;
            clearTimeout(timeoutId);
            reject(err);
          }
        });
    });
  }

  async buyContract(symbol: string, amount: number, contractType: "CALL" | "PUT" | "BUY" | "SELL", duration: number, durationUnit = "s", passthrough?: any) {
    const derivSym = getDerivSymbol(symbol);
    const finalAmount = Number(amount.toFixed(2));
    const isForex = derivSym.startsWith("frx");

    // Map BUY/SELL to CALL/PUT (Deriv binary API uses CALL/PUT)
    const derivType: "CALL" | "PUT" = (contractType === "BUY" || contractType === "CALL") ? "CALL" : "PUT";

    // Wait for the API to be ready (WS connected + authenticated via OTP)
    await this.waitForReady();

    // Guard: don't attempt to trade if WS not connected
    if (!this.ws || this.ws.readyState !== 1) {
      let reason = "WebSocket not connected";
      if (!this.token) reason = "No token provided";
      throw new Error(`Cannot trade: [${this.name}] ${reason}. Check token or network.`);
    }

    const startTs = Date.now();
    const isEpoch = duration > 1000000000;

    // Calculate dynamic execution limits based on timeframe and duration
    const tf = passthrough?.timeframe || "1m";
    const limits = getDynamicExecutionLimits(tf, duration, durationUnit);

    // Direct Buy Optimization: Send single `buy: 1` request with `parameters`
    // This eliminates the 2-step `proposal` -> `buy` round trip delay and reduces latency by 50%+
    const directBuyParams: Record<string, any> = {
      amount: finalAmount,
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
      price: finalAmount,
      parameters: directBuyParams
    };

    if (passthrough) {
      directBuyPayload.passthrough = passthrough;
    }

    try {
      const directRes = await this.sendWithTimeout(directBuyPayload, limits.proposalTimeoutMs);
      if (directRes?.buy?.contract_id) {
        console.log(`[DerivAPI:${this.name}] ⚡ Direct Buy executed in ${Date.now() - startTs}ms (single round-trip)`);
        return directRes.buy;
      }
    } catch (directErr: any) {
      console.warn(`[DerivAPI:${this.name}] Direct buy attempt failed: ${directErr?.message || directErr}. Falling back to 2-step proposal...`);
    }

    // Step 1: Get proposal (fallback 2-step if direct buy is not accepted)
    const proposalPayload: Record<string, any> = {
      proposal: 1,
      amount: finalAmount,
      basis: "stake",
      contract_type: derivType,
      currency: this.currency,
      underlying_symbol: derivSym
    };

    if (isEpoch) {
      proposalPayload.date_expiry = duration;
    } else {
      proposalPayload.duration = duration;
      proposalPayload.duration_unit = isForex && durationUnit === "s" ? "m" : durationUnit;
    }

    if (passthrough) {
      proposalPayload.passthrough = passthrough;
    }

    const proposalRes = await this.sendWithTimeout(proposalPayload, limits.proposalTimeoutMs);
    if (!proposalRes?.proposal?.id) {
      throw new Error(`Proposal failed: no proposal id returned`);
    }

    // Step 2: Buy using proposal ID (respecting dynamic operational window)
    const elapsed = Date.now() - startTs;
    if (elapsed > limits.proposalMaxWindowMs) {
      throw new Error(`Proposal took too long (${elapsed}ms > ${limits.proposalMaxWindowMs}ms) — aborting buy to respect dynamic window`);
    }

    const buyPayload: Record<string, any> = {
      buy: proposalRes.proposal.id,
      price: finalAmount
    };

    if (passthrough) {
      buyPayload.passthrough = passthrough;
    }

    const buyRes = await this.sendWithTimeout(buyPayload, 10000);

    if (buyRes?.buy) {
      return buyRes.buy;
    }
    throw new Error(`Buy failed: no contract_id returned`);
  }

  async sellContract(contractId: number, price: number = 0) {
    const res = await this.send({
      sell: contractId,
      price: Math.max(0, price)
    });
    return res.sell;
  }

  disconnect() {
    this._cleanupIntervals();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = () => { };
      try { this.ws.close(); } catch (e) {
        // Ignore close errors
      }
      this.ws = null;
    }
  }

  /** Maximum consecutive reconnection attempts before giving up */
  private _maxRetries = 30;

  /** Reconnect with exponential backoff + jitter, using cached OTP URL */
  private _reconnect(token: string | null): void {
    if (this._reconnectAttempt >= this._maxRetries) {
      console.error(`[DerivAPI:${this.name}] Max retries (${this._maxRetries}) reached. Giving up.`);
      return;
    }

    // Exponential backoff: 2s → 4s → 8s → ... capped at _maxBackoff
    const baseDelay = Math.min(2000 * Math.pow(2, this._reconnectAttempt), this._maxBackoff);
    const delay = Math.round(baseDelay * (0.5 + Math.random() * 0.5)); // full jitter
    this._reconnectAttempt++;

    console.log(`[DerivAPI:${this.name}] Reconnecting in ${delay}ms (attempt #${this._reconnectAttempt})...`);

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect(token || undefined).catch(e => {
        console.error(`[DerivAPI:${this.name}] Reconnection failed:`, e);
      });
    }, delay);
  }

  private _cleanupIntervals(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this._zombieCheckInterval) {
      clearInterval(this._zombieCheckInterval);
      this._zombieCheckInterval = null;
    }
    if (this._otpRefreshInterval) {
      clearInterval(this._otpRefreshInterval);
      this._otpRefreshInterval = null;
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
    console.log(`[DerivCore] ✅ MT5 logged in (login: ${loginId})`);
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
        volume,
        type: 0,
        price: 0,
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
}

export const derivAPI = new DerivAPI();
