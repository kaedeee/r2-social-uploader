import axios from "axios";

export async function postIFTTT({
  webhookKey,
  eventName = "r2_to_threads",
  text,
  videoUrl,
  type,
}) {
  try {
    const webhookUrl = `https://maker.ifttt.com/trigger/${eventName}/json/with/key/${webhookKey}`;

    const payload = {
      text,
      videoUrl,
      ...(type && { type }),
    };

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    // IFTTTのレスポンスをチェック
    if (response.status === 200) {
      return { ok: true, response: response.data };
    } else {
      return { ok: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error("IFTTT posting error:", error.message);
    return {
      ok: false,
      error: error.message || "Unknown error",
    };
  }
}
