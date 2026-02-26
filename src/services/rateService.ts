type Rates = {
  btc_usd: number | null;
  eth_usd: number | null;
  usdt_usd: number | null;
  usdc_usd: number | null;
  updated_at: number | null;
};

let cache: { data: Rates; ts: number } | null = null;

export const fetchRates = async (): Promise<Rates> => {
  const now = Date.now();
  if (cache && now - cache.ts < 30_000) {
    return cache.data;
  }
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,usd-coin&vs_currencies=usd&include_last_updated_at=true";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Rate provider error");
  }
  const payload = await response.json();
  const data: Rates = {
    btc_usd: payload.bitcoin?.usd ?? null,
    eth_usd: payload.ethereum?.usd ?? null,
    usdt_usd: payload.tether?.usd ?? null,
    usdc_usd: payload["usd-coin"]?.usd ?? null,
    updated_at: payload.bitcoin?.last_updated_at ?? null,
  };
  cache = { data, ts: now };
  return data;
};

