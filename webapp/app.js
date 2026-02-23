const form = document.getElementById("exchange-form");
const success = document.getElementById("success");
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

const applyTelegramTheme = () => {
  if (!tg || !tg.themeParams) return;
  const theme = tg.themeParams;
  if (theme.button_color) {
    document.documentElement.style.setProperty("--accent", theme.button_color);
    document.documentElement.style.setProperty("--accent-strong", theme.button_color);
  }
};

if (tg) {
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) tg.setHeaderColor("#0a0c10");
  if (tg.setBackgroundColor) tg.setBackgroundColor("#0a0c10");
  applyTelegramTheme();
}

const rateMap = {
  bitcoin: "BTC",
  ethereum: "ETH",
  tether: "USDT",
  "usd-coin": "USDC",
};

const rateTargets = document.querySelectorAll("[data-rate]");

const formatPrice = (value) => {
  let options = { maximumFractionDigits: 2 };
  if (value < 1) options = { maximumFractionDigits: 6 };
  else if (value < 100) options = { maximumFractionDigits: 4 };
  return new Intl.NumberFormat("en-US", options).format(value);
};

const loadRates = async () => {
  try {
    const ids = Object.keys(rateMap).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const response = await fetch(url);
    if (!response.ok) return;
    const data = await response.json();
    rateTargets.forEach((el) => {
      const symbol = el.getAttribute("data-rate");
      const entry = Object.entries(rateMap).find(([, label]) => label === symbol);
      if (!entry) return;
      const [coinId] = entry;
      const value = data?.[coinId]?.usd;
      if (typeof value === "number") {
        el.textContent = `$${formatPrice(value)}`;
      }
    });
  } catch (error) {
    // Silent fallback
  }
};

loadRates();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    direction: formData.get("direction"),
    from_currency: formData.get("from_currency"),
    to_currency: formData.get("to_currency"),
    amount: formData.get("amount"),
    payment_method: formData.get("payment_method"),
    city: formData.get("city"),
    urgency: formData.get("urgency"),
    phone: formData.get("phone"),
  };

  if (tg) {
    tg.sendData(JSON.stringify(payload));
    tg.close();
    return;
  }

  success.style.display = "block";
});
