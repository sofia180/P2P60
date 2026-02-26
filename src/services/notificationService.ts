import { Db } from "../db/index.js";

export const sendWebhook = async (db: Db, userId: string, event: string, payload: any) => {
  const result = await db.query("SELECT * FROM webhook_subscriptions WHERE user_id=$1 AND active=true", [userId]);
  const subs = result.rows;
  await Promise.all(
    subs
      .filter((sub) => sub.events.includes(event))
      .map((sub) =>
        fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-P2P60-Event": event,
            "X-P2P60-Secret": sub.secret ?? "",
          },
          body: JSON.stringify(payload),
        }).catch(() => null)
      )
  );
};
