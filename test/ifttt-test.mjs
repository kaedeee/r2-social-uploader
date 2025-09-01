import dotenv from "dotenv";
import { postIFTTT } from "../src/ifttt.mjs";

// .envファイルを読み込み
dotenv.config();

// テスト用の設定
const TEST_CONFIG = {
  webhookKey: process.env.IFTTT_WEBHOOK_KEY || "YOUR_WEBHOOK_KEY_HERE",
  eventName: "r2_to_threads",
  text: "まるで飼い主が天国に行った後のような光景だと話題に...",
  videoUrl:
    "https://video.twimg.com/ext_tw_video/1939214301669056512/pu/vid/avc1/960x720/w8_i8C3MW5-MCoTg.mp4?tag=12",
};

async function testIFTTT() {
  console.log("=== IFTTT接続テスト ===");
  console.log("Webhook Key:", TEST_CONFIG.webhookKey);
  console.log("Event Name:", TEST_CONFIG.eventName);
  console.log("Text:", TEST_CONFIG.text);
  console.log("Video URL:", TEST_CONFIG.videoUrl);
  console.log("");

  if (
    !TEST_CONFIG.webhookKey ||
    TEST_CONFIG.webhookKey === "YOUR_WEBHOOK_KEY_HERE"
  ) {
    console.error("❌ IFTTT_WEBHOOK_KEYが設定されていません");
    console.log("環境変数または.envファイルで設定してください");
    return;
  }

  try {
    console.log("IFTTTに投稿中...");
    const result = await postIFTTT(TEST_CONFIG);

    if (result.ok) {
      console.log("✅ 成功:", result.response);
    } else {
      console.log("❌ 失敗:", result.error);
    }
  } catch (error) {
    console.error("❌ エラー:", error.message);
    if (error.response) {
      console.error("レスポンス:", error.response.data);
      console.error("ステータス:", error.response.status);
      console.error("ヘッダー:", error.response.headers);
    }
  }
}

testIFTTT();
