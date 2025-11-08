import dotenv from "dotenv";
import axios from "axios";
import { postFacebookVideo } from "../src/facebook.video-api.mjs";

// .envファイルを読み込み
dotenv.config();

// 本番と同じ環境変数から読み込み
let FB_PAGES = [];
let ROB_FB_PAGE = null;

try {
  const fbPagesValue = process.env.FB_PAGES;
  if (fbPagesValue) {
    const trimmed = fbPagesValue.trim();
    if (trimmed && trimmed !== '""' && trimmed !== "''") {
      // 空文字列やクォートのみの場合はスキップ
      FB_PAGES = JSON.parse(trimmed);
    }
  }
} catch (e) {
  console.warn("[WARN] FB_PAGES のパースに失敗しました:", e.message);
  console.warn("[DEBUG] FB_PAGES の値:", JSON.stringify(process.env.FB_PAGES));
  FB_PAGES = [];
}

try {
  if (process.env.ROB_FB_PAGE && process.env.ROB_FB_PAGE.trim()) {
    ROB_FB_PAGE = JSON.parse(process.env.ROB_FB_PAGE);
  }
} catch (e) {
  console.warn("[WARN] ROB_FB_PAGE のパースに失敗しました:", e.message);
  ROB_FB_PAGE = null;
}

// テスト用の設定（本番と同じ環境変数を使用）
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const fbAcc =
  (FB_PAGES.length > 0 ? pickRandom(FB_PAGES) : null) || ROB_FB_PAGE;

const TEST_CONFIG = {
  pageId: fbAcc?.pageId,
  accessToken: fbAcc?.accessToken,
  videoUrl:
    process.env.FB_TEST_VIDEO_URL ||
    "https://pub-a0b576d525fd4f968eec27587a4d44d1.r2.dev/%E8%87%AA%E7%94%B1%E3%81%8B%E3%82%99%E4%B8%98%E3%81%A8%E3%82%99%E3%81%93%E3%81%AE%E3%81%8A%E5%BA%97%E3%82%82%E9%96%89%E3%81%BE%E3%81%A3%E3%81%A6%E3%82%8B%E3%80%82%20%E3%81%93%E3%82%93%E3%81%AA%E5%85%89%E6%99%AF%E5%88%9D%E3%82%81%E3%81%A6%E8%A6%8B%E3%81%9F%20%23%E3%82%B1%E3%82%99%E3%83%AA%E3%83%A9%E8%B1%AA%E9%9B%A8%20%23%E8%87%AA%E7%94%B1%E3%81%8B%E3%82%99%E4%B8%98%20%23%E3%82%B1%E3%82%99%E3%83%AA%E3%83%A9%E8%B1%AA%E9%9B%A8%20%23%E9%96%89%E5%BA%97%20%23%E9%A9%9A%E3%81%8D%E3%81%AE%E9%A2%A8%E6%99%AF%20%23%E3%82%B7%E3%83%A7%E3%83%BC%E3%83%88%20%23%E3%83%8F%E3%82%99%E3%82%B9%E3%82%99%E3%82%8C%20%E3%82%82%E3%81%99%E3%81%A1%E3%82%83%E3%82%93%20%20%E3%80%8C%E8%87%AA%E7%94%B1%E3%81%8B%E3%82%99%E4%B8%98%20%E3%81%8A%E5%BA%97%20%E9%96%89%E3%81%BE%E3%81%A3%E3%81%A6%E3%82%8B%E3%80%8D%E3%81%A3%E3%81%A6%E3%80%81%E3%81%BE%E3%81%95%E3%81%AB%E4%BB%8A%E8%A9%B1%E9%A1%8C%E3%81%AE%E3%83%9B%E3%82%9A%E3%82%A4%E3%83%B3%E3%83%88%EF%BC%81%E4%BB%8A%E5%9B%9E%E3%81%AF%E3%80%81%E3%82%B1%E3%82%99%E3%83%AA%E3%83%A9%E8%B1%AA%E9%9B%A8%E3%81%AE%E5%BD%B1%E9%9F%BF%E3%81%A6%E3%82%99%E8%87%AA%E7%94%B1%E3%81%8B%E3%82%99%E4%B8%98%E3%81%AE%E8%A1%97%E3%81%8B%E3%82%99%E3%82%B9%E3%83%83%E3%82%AB%E3%82%B9%E3%82%AB%E3%81%AB%E3%81%AA%E3%81%A3%E3%81%A6%E3%82%8B%E6%A7%98%E5%AD%90%E3%82%92%E3%81%8A%E5%B1%8A%E3%81%91%EF%BC%81%E3%81%93%E3%82%93%E3%81%AA%E5%85%89%E6%99%AF%E3%80%81%E5%88%9D%E3%82%81%E3%81%A6%E8%A6%8B%E3%81%9F%E3%82%88%E3%81%AD%E3%80%82%E6%99%AE%E6%AE%B5%E3%81%AF%E8%B3%91%E3%82%84%E3%81%8B%E3%81%AA%E8%A1%97%E3%81%8B%E3%82%99%E4%B8%80%E7%9E%AC%E3%81%AB%E3%81%97%E3%81%A6%E9%9D%99%E3%81%BE%E3%82%8A%E8%BF%94%E3%82%8B%E3%81%A8%E3%80%81%E3%81%AA%E3%82%93%E3%81%9F%E3%82%99%E3%81%8B%E4%B8%8D%E6%80%9D%E8%AD%B0%E3%81%AA%E6%B0%97%E6%8C%81%E3%81%A1%E3%81%AB%E3%81%AA%E3%82%8B%E3%82%88%E3%81%AD%E3%80%82%E9%9B%A8.mp4",
  caption: "テスト投稿: Facebook Video API の動作確認",
  apiVersion: "v24.0",
};

async function testFacebookVideo() {
  console.log("=== Facebook Video API テスト ===");
  console.log("Page ID:", TEST_CONFIG.pageId);
  console.log(
    "Access Token:",
    TEST_CONFIG.accessToken
      ? `${TEST_CONFIG.accessToken.substring(0, 20)}...`
      : "未設定"
  );
  console.log("Video URL:", TEST_CONFIG.videoUrl);
  console.log("Caption:", TEST_CONFIG.caption);
  console.log("API Version:", TEST_CONFIG.apiVersion);
  console.log("");

  if (!TEST_CONFIG.pageId || !TEST_CONFIG.accessToken) {
    console.error(
      "❌ Facebook Page ID または Access Token が設定されていません"
    );
    console.log("環境変数を設定してください:");
    console.log("  ROB_FB_PAGE または FB_PAGES");
    return;
  }

  if (!TEST_CONFIG.videoUrl) {
    console.error("❌ テスト用の動画URLが設定されていません");
    console.log("FB_TEST_VIDEO_URL 環境変数を設定してください");
    return;
  }

  // アクセストークンの権限を確認
  try {
    console.log("アクセストークンの権限を確認中...");
    const tokenInfo = await axios.get(
      `https://graph.facebook.com/v24.0/me?access_token=${TEST_CONFIG.accessToken}`
    );
    console.log("✅ アクセストークンは有効です");
  } catch (tokenError) {
    console.warn(
      "⚠️  アクセストークンの確認でエラー:",
      tokenError.response?.data || tokenError.message
    );
  }

  // ページ情報と権限を確認し、ページアクセストークンを取得
  let pageAccessToken = TEST_CONFIG.accessToken;
  try {
    console.log("ページ情報と権限を確認中...");
    const pageInfo = await axios.get(
      `https://graph.facebook.com/v24.0/${TEST_CONFIG.pageId}?fields=name,access_token&access_token=${TEST_CONFIG.accessToken}`
    );
    console.log("ページ名:", pageInfo.data.name);

    // ページアクセストークンが取得できるか確認
    if (pageInfo.data.access_token) {
      pageAccessToken = pageInfo.data.access_token;
      console.log("✅ ページアクセストークンを取得できました");
      console.log("💡 ページアクセストークンを使用して投稿します");
    } else {
      console.warn("⚠️  ページアクセストークンが取得できませんでした");
      console.log("💡 元のアクセストークンを使用します");
    }
  } catch (pageError) {
    console.warn(
      "⚠️  ページ情報の取得でエラー:",
      pageError.response?.data || pageError.message
    );
    console.log("💡 ヒント: ページの管理者権限があるか確認してください");
    console.log("💡 元のアクセストークンを使用します");
  }

  console.log("");

  try {
    console.log("Facebookに動画を投稿中...");
    const result = await postFacebookVideo({
      pageId: TEST_CONFIG.pageId,
      accessToken: pageAccessToken, // 取得したページアクセストークンを使用
      videoUrl: TEST_CONFIG.videoUrl,
      caption: TEST_CONFIG.caption,
      apiVersion: TEST_CONFIG.apiVersion,
    });

    if (result.ok) {
      console.log("✅ 成功!");
      console.log("Video ID:", result.id);
    } else {
      console.log("❌ 失敗:");
      console.log("エラー:", result.error);
    }
  } catch (error) {
    console.error("❌ エラー:", error.message);
    if (error.response) {
      console.error(
        "レスポンス:",
        JSON.stringify(error.response.data, null, 2)
      );
      console.error("ステータス:", error.response.status);
    }
  }
}

testFacebookVideo();
