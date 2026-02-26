const $ = (id) => document.getElementById(id);

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const formatUsd = (value) => {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 100 ? 0 : 2,
  }).format(value);
};

const renderRates = async () => {
  try {
    const res = await fetch("/api/rates");
    if (!res.ok) throw new Error("rates");
    const data = await res.json();
    const map = {
      BTC: data.btc_usd,
      ETH: data.eth_usd,
      USDT: data.usdt_usd,
      USDC: data.usdc_usd,
    };
    const nodes = Array.from(document.querySelectorAll("#rates .rate"));
    nodes.forEach((node) => {
      const label = node.querySelector("span")?.textContent?.trim();
      const price = map[label] ?? null;
      const strong = node.querySelector("strong");
      if (strong) strong.textContent = formatUsd(price);
    });
    const updated = data.updated_at ? new Date(data.updated_at * 1000) : new Date();
    $("ratesUpdated").textContent = `Обновлено ${updated.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (err) {
    $("ratesUpdated").textContent = "Не удалось обновить курсы";
  }
};

const collectPayload = () => ({
  giveCurrency: $("giveCurrency").value,
  getCurrency: $("getCurrency").value,
  amount: $("amount").value,
  paymentMethod: $("paymentMethod").value,
  location: $("location").value,
  urgency: $("urgency").value,
  phone: $("phone").value,
  ts: Date.now(),
});

const sendDeal = () => {
  const payload = collectPayload();
  if (tg) {
    tg.sendData(JSON.stringify(payload));
    tg.showPopup({ title: "Заявка", message: "Условия отправлены оператору.", buttons: [{ type: "close" }] });
  } else {
    alert("Заявка собрана. Откройте в Telegram для отправки.");
  }
};

$("submitDeal").addEventListener("click", sendDeal);
$("ctaStart").addEventListener("click", sendDeal);
$("ctaSupport").addEventListener("click", () => {
  if (tg) tg.openTelegramLink("https://t.me/p2p60bot");
  else window.location.href = "https://t.me/p2p60bot";
});

renderRates();
setInterval(renderRates, 30000);
