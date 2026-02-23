const form = document.getElementById("exchange-form");
const success = document.getElementById("success");
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

if (tg) {
  tg.ready();
  tg.expand();
}

const rateMap = {
  bitcoin: "BTC",
  ethereum: "ETH",
  tether: "USDT",
  "usd-coin": "USDC",
};

const rateTargets = document.querySelectorAll("[data-rate]");

const formatPrice = (value) => {
  if (value >= 1000) return value.toFixed(2);
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
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
        el.textContent = formatPrice(value);
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
