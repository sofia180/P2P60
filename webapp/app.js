const form = document.getElementById("exchange-form");
const success = document.getElementById("success");
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

if (tg) {
  tg.ready();
  tg.expand();
}

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
