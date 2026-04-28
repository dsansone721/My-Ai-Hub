// Current market price from a keyless source. SEC EDGAR is fundamentals-only,
// so we fetch live price separately. Primary: Yahoo Finance v8 chart endpoint.
// Fallback: Stooq CSV endpoint (also keyless) when Yahoo returns null —
// Yahoo occasionally blocks server IPs or returns HTML interstitials.

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchFromYahoo(ticker: string): Promise<number | null> {
  try {
    // Match the exact endpoint shape: /v8/finance/chart/{ticker}?interval=1d&range=1d
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(
      ticker
    )}?interval=1d&range=1d`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://finance.yahoo.com/",
        Origin: "https://finance.yahoo.com",
      },
    });

    if (!res.ok) {
      console.error(
        `[fetchFromYahoo] HTTP ${res.status} ${res.statusText} for '${ticker}'`
      );
      return null;
    }

    // Yahoo sometimes returns an HTML challenge page with a 200 status when
    // it doesn't trust the request. Detect that and bail.
    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("<")) {
      console.error(
        `[fetchFromYahoo] received HTML instead of JSON for '${ticker}' (likely IP-blocked)`
      );
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      data = JSON.parse(trimmed);
    } catch {
      console.error(`[fetchFromYahoo] non-JSON response for '${ticker}'`);
      return null;
    }

    if (data?.chart?.error) {
      console.error(
        `[fetchFromYahoo] chart.error for '${ticker}':`,
        data.chart.error
      );
      return null;
    }

    const meta = data?.chart?.result?.[0]?.meta;
    const candidates: unknown[] = [
      meta?.regularMarketPrice,
      meta?.previousClose,
      meta?.chartPreviousClose,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
    }
    return null;
  } catch (err) {
    console.error(`[fetchFromYahoo] error for '${ticker}':`, err);
    return null;
  }
}

async function fetchFromStooq(ticker: string): Promise<number | null> {
  // Stooq CSV: header line + one data row.
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  // AAPL.US,2026-04-26,22:00:01,175.21,176.48,174.99,175.43,52341234
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(
      ticker.toLowerCase()
    )}.us&f=sd2t2ohlcv&h&e=csv`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" },
    });
    if (!res.ok) {
      console.error(
        `[fetchFromStooq] HTTP ${res.status} ${res.statusText} for '${ticker}'`
      );
      return null;
    }

    const text = (await res.text()).trim();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    if (cols.length < 7) return null;

    // Stooq returns "N/D" (no data) for unknown tickers.
    const closeRaw = cols[6]?.trim();
    if (!closeRaw || closeRaw === "N/D") return null;
    const close = Number(closeRaw);
    if (!Number.isFinite(close) || close <= 0) return null;
    return close;
  } catch (err) {
    console.error(`[fetchFromStooq] error for '${ticker}':`, err);
    return null;
  }
}

/**
 * Best-effort current price fetch. Returns null only if both Yahoo and Stooq
 * fail. Never throws.
 */
export async function fetchCurrentPrice(
  ticker: string
): Promise<number | null> {
  const yahoo = await fetchFromYahoo(ticker);
  if (yahoo !== null) return yahoo;

  console.warn(
    `[fetchCurrentPrice] Yahoo returned null for '${ticker}', trying Stooq fallback`
  );
  const stooq = await fetchFromStooq(ticker);
  if (stooq !== null) {
    console.info(
      `[fetchCurrentPrice] Stooq fallback succeeded for '${ticker}': $${stooq}`
    );
    return stooq;
  }

  console.error(
    `[fetchCurrentPrice] both Yahoo and Stooq failed for '${ticker}'`
  );
  return null;
}
