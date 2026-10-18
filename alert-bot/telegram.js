// Minimal Telegram Bot API client.
export function createTelegram(token) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(method, body = {}) {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
    return data.result;
  }

  return {
    call,
    getUpdates: (offset) => call("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "pre_checkout_query"] }),
    send: (chatId, text) => call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }),
    // Telegram Stars ("XTR") need no payment provider token.
    sendStarsInvoice: (chatId, { title, description, payload, stars }) =>
      call("sendInvoice", {
        chat_id: chatId,
        title,
        description,
        payload,
        currency: "XTR",
        prices: [{ label: title, amount: stars }],
      }),
    answerPreCheckout: (id, ok = true) => call("answerPreCheckoutQuery", { pre_checkout_query_id: id, ok }),
  };
}
