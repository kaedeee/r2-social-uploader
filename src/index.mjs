import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import axios from "axios";
import { postInstagram } from "./instagram.mjs";
import { uploadYouTube } from "./youtube.mjs";
import { postIFTTT } from "./ifttt.mjs";
import { postFacebookReel } from "./facebook.mjs";

// ==== 環境変数 ====
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,

  IG_ACCOUNTS, // ★ JSON配列
  ROB_IG_ACCOUNT, // ★ ROB用のInstagramアカウント
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  YT_ACCOUNTS, // ★ JSON配列
  FB_PAGES, // ★ JSON配列 [{ pageId, accessToken }, ...]
  ROB_FB_PAGE, // ★ ROB用のFacebook Page

  IFTTT_WEBHOOK_KEY,
  IFTTT_EVENT_NAME = "r2_to_threads",

  SLACK_WEBHOOK_URL, // Slack通知用のWebhook URL（オプショナル）

  POST_WINDOW_JST = "10-18",
  YT_DAILY_LIMIT = "6",
  DRY_RUN,
} = process.env;

if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET ||
  !R2_PUBLIC_BASE_URL
) {
  throw new Error("Missing R2 envs.");
}
if (!IG_ACCOUNTS) throw new Error("Missing IG_ACCOUNTS (JSON).");
if (!ROB_IG_ACCOUNT) throw new Error("Missing ROB_IG_ACCOUNT (JSON).");
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !YT_ACCOUNTS) {
  throw new Error(
    "Missing YouTube envs (GOOGLE_CLIENT_ID/SECRET, YT_ACCOUNTS)."
  );
}
if (!IFTTT_WEBHOOK_KEY) {
  throw new Error("Missing IFTTT_WEBHOOK_KEY.");
}

const IG_LIST = JSON.parse(IG_ACCOUNTS); // [{ userId, accessToken }, ...]
const ROB_IG = JSON.parse(ROB_IG_ACCOUNT); // { userId, accessToken }
const YT_LIST = JSON.parse(YT_ACCOUNTS); // [{ refreshToken }, ...]
const FB_LIST = FB_PAGES ? JSON.parse(FB_PAGES) : []; // [{ pageId, accessToken }, ...]
const ROB_FB = ROB_FB_PAGE ? JSON.parse(ROB_FB_PAGE) : null; // { pageId, accessToken }

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ==== ユーティリティ ====
function inPostWindowJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = jst.getUTCHours();
  const [start, end] = POST_WINDOW_JST.split("-").map((n) => parseInt(n, 10));
  return hour >= start && hour <= end;
}

async function deleteVideo(key, reason = "immediate") {
  try {
    if (DRY_RUN === "1") {
      console.log(
        `[DELETE_${reason.toUpperCase()}] DRY_RUN → skip delete ${key}`
      );
    } else {
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      console.log(`[DELETE_${reason.toUpperCase()}] deleted: ${key}`);
    }
  } catch (error) {
    console.error(
      `[DELETE_${reason.toUpperCase()}] error deleting ${key}:`,
      error
    );
  }
}

async function pickOneObject() {
  // バケット直下から最年長1件
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1000 })
  );
  const candidates = (list.Contents || []).filter(
    (o) => o.Key && !o.Key.endsWith("/") && !o.Key.startsWith(".")
  );
  return (
    candidates.sort(
      (a, b) => (a.LastModified || 0) - (b.LastModified || 0)
    )[0] || null
  );
}

function publicUrlForKey(key) {
  const safeKey = key.split("/").map(encodeURIComponent).join("/");
  return `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${safeKey}`;
}

async function head200(url) {
  try {
    const res = await axios.head(url, {
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 15000,
    });
    return (
      res.status === 200 &&
      /^video\/mp4|image\//i.test(res.headers["content-type"] || "")
    );
  } catch {
    return false;
  }
}

// === ファイル名→メタ生成 ===
function parseMetaFromFilename(key) {
  // 1) ファイル名（拡張子除去、URLデコード）
  let file;
  const rawFile = key.split("/").pop() || key;

  try {
    file = decodeURIComponent(rawFile);
  } catch (e) {
    // URLデコードに失敗した場合は問題のある文字を削除して再試行
    console.warn(`[WARN] Failed to decode URI component, cleaning: ${rawFile}`);
    const cleaned = rawFile.replace(/[^\x00-\x7F]/g, ""); // ASCII文字以外を削除
    try {
      file = decodeURIComponent(cleaned);
    } catch (e2) {
      // それでも失敗した場合は元の文字列を使用
      console.warn(`[WARN] Still failed after cleaning, using raw: ${rawFile}`);
      file = rawFile;
    }
  }

  // 絵文字のみを削除
  file = file.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
    ""
  );

  const base = file.replace(/\.[^.]+$/, ""); // 拡張子除去

  // 2) プレフィックス検出と除去（_をスペースに変換する前に実行）
  let skipYouTube = false;
  let skipInstagram = false;
  let isRob = false;
  let processedBase = base;

  if (base.startsWith("ROB_")) {
    isRob = true;
    skipYouTube = true;
    processedBase = base.replace(/^ROB_/, "");
  } else if (base.startsWith("YT_IG_SK")) {
    skipYouTube = true;
    skipInstagram = true;
    processedBase = base.replace(/^YT_IG_SK/, "");
  } else if (base.startsWith("YT_SK")) {
    skipYouTube = true;
    processedBase = base.replace(/^YT_SK/, "");
  }

  // 3) _→空白、空白正規化
  const underscored = processedBase.replace(/_/g, " ");
  let caption = underscored.replace(/\s+/g, " ").trim(); // IG/説明 共通

  // 3) YouTube タイトルは先頭100文字に丸め（サロゲートに配慮）
  const title = [...caption].slice(0, 100).join("");

  return {
    caption,
    ytTitle: title,
    ytDescription: caption,
    skipYouTube,
    skipInstagram,
    isRob,
  };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ==== エラー情報の要約 ====
function formatErrorForSlack(error, platformName) {
  if (!error) return "Unknown error";

  // ネストされたerrorオブジェクトからメッセージを再帰的に検索
  function findMessage(obj) {
    if (typeof obj !== "object" || obj === null) return null;
    if (obj.message && typeof obj.message === "string") return obj.message;
    if (obj.error) return findMessage(obj.error);
    return null;
  }

  // エラーメッセージのみを抽出
  try {
    // axiosのエラーレスポンスの場合
    if (error?.response?.data) {
      const data = error.response.data;

      // ネストされたerrorオブジェクトからメッセージを検索
      const message = findMessage(data);
      if (message) return message;

      // 文字列の場合
      if (typeof data === "string") {
        return data.length > 500 ? data.substring(0, 500) + "..." : data;
      }
    }

    // エラーオブジェクト自体からメッセージを検索
    const message = findMessage(error);
    if (message) {
      return message.length > 500 ? message.substring(0, 500) + "..." : message;
    }
  } catch (e) {
    // パースエラーの場合は元のエラーを返す
  }

  // フォールバック: 文字列化
  const str = String(error);
  return str.length > 500 ? str.substring(0, 500) + "..." : str;
}

// ==== Slack通知（リッチ形式、フォールバック付き） ====
async function sendSlackMessage(statuses) {
  if (!SLACK_WEBHOOK_URL) {
    console.log("[SLACK] Webhook URL not configured, skipping notification");
    return;
  }

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📹 Video Upload Status: ${statuses.videoKey}`,
        emoji: true,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Action:* ${
          statuses.willDelete ? "🗑️ DELETE (30s delay)" : "💾 KEEP"
        }`,
      },
    },
    {
      type: "divider",
    },
  ];

  // 各プラットフォームのステータスを追加
  const platformStatuses = [
    {
      name: "Instagram",
      status: statuses.ig,
      error: statuses.igError,
      skip: statuses.skipInstagram,
    },
    {
      name: "IFTTT",
      status: statuses.ifttt,
      error: statuses.iftttError,
      skip: false,
    },
    {
      name: "Facebook",
      status: statuses.fb,
      error: statuses.fbError,
      skip: statuses.skipFacebook,
    },
    {
      name: "YouTube",
      status: statuses.yt,
      error: statuses.ytError,
      skip: statuses.skipYouTube,
    },
  ];

  for (const platform of platformStatuses) {
    if (platform.skip) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${platform.name}:* ⏭️ SKIP`,
        },
      });
    } else if (platform.error) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${platform.name}:* ❌ ERROR`,
        },
      });
      // エラー詳細を追加（重要な情報だけを抽出）
      const errorText = formatErrorForSlack(platform.error, platform.name);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\`\`\`${errorText}\`\`\``,
        },
      });
    } else {
      const emoji = platform.status ? "✅" : "❌";
      const status = platform.status ? "OK" : "NG";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${platform.name}:* ${emoji} ${status}`,
        },
      });
    }
  }

  try {
    await axios.post(
      SLACK_WEBHOOK_URL,
      {
        blocks: blocks,
        text: `Video Upload Status: ${statuses.videoKey} - ${
          statuses.willDelete ? "DELETE" : "KEEP"
        }`, // フォールバック用テキスト
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    console.log("[SLACK] Message sent successfully");
    return; // 成功した場合はここで終了（フォールバックを実行しない）
  } catch (error) {
    console.error("[SLACK] Failed to send rich message:", error.message);
    // フォールバック: プレーンテキストで送信
    try {
      const fallbackMessage =
        `Video: ${statuses.videoKey}\n` +
        `Action: ${statuses.willDelete ? "DELETE (30s delay)" : "KEEP"}\n` +
        platformStatuses
          .map((p) => {
            if (p.skip) return `${p.name}: SKIP`;
            if (p.error) {
              const errorText = formatErrorForSlack(p.error, p.name);
              return `${p.name}: ERROR\n\`\`\`${errorText}\`\`\``;
            }
            return `${p.name}: ${p.status ? "OK" : "NG"}`;
          })
          .join("\n");
      await axios.post(
        SLACK_WEBHOOK_URL,
        {
          text: fallbackMessage,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      console.log("[SLACK] Fallback message sent successfully");
    } catch (fallbackError) {
      console.error(
        "[SLACK] Failed to send fallback message:",
        fallbackError.message
      );
    }
  }
}

// ==== メイン ====
async function main() {
  console.log(`[start] ${new Date().toISOString()}`);

  if (!inPostWindowJST()) {
    console.log(`Skip: outside JST window ${POST_WINDOW_JST}`);
    return;
  }

  const obj = await pickOneObject();
  if (!obj) {
    console.log("No object to post.");
    return;
  }
  const key = obj.Key;
  const url = publicUrlForKey(key);
  console.log(`Picked: ${key}`);
  console.log(`URL: ${url}`);

  if (!(await head200(url))) {
    throw new Error(`Public URL is not 200 or invalid content-type: ${url}`);
  }

  // メタ生成
  const { caption, ytTitle, ytDescription, skipYouTube, skipInstagram, isRob } =
    parseMetaFromFilename(key);
  console.log(`IG caption: ${caption}`);
  console.log(`YT title: ${ytTitle}`);
  if (skipYouTube)
    console.log(
      `[SKIP] YouTube upload skipped due to ${isRob ? "ROB" : "YT_SK"} prefix`
    );
  if (skipInstagram) {
    console.log(`[SKIP] Instagram upload skipped due to YT_IG_SK prefix`);
    console.log(`[SKIP] Facebook upload skipped due to YT_IG_SK prefix`);
  }
  if (isRob) {
    console.log(`[ROB] Using ROB Instagram account and IFTTT type: rob`);
    if (ROB_FB) {
      console.log(`[ROB] Using ROB Facebook Page`);
    }
  }

  // ランダムにアカウントを選択
  const igAcc = isRob ? ROB_IG : pickRandom(IG_LIST);
  const ytAcc = pickRandom(YT_LIST);
  const fbAcc = isRob
    ? ROB_FB
    : FB_LIST.length > 0
    ? pickRandom(FB_LIST)
    : null;

  // ===== IFTTT =====
  let iftttOk = false;
  let iftttError = null;
  try {
    if (DRY_RUN === "1") {
      console.log("[IFTTT] DRY_RUN → skip");
      iftttOk = true;
    } else {
      const iftttRes = await postIFTTT({
        webhookKey: IFTTT_WEBHOOK_KEY,
        eventName: IFTTT_EVENT_NAME,
        text: caption,
        videoUrl: url,
        type: isRob ? "rob" : undefined,
      });
      iftttOk = iftttRes.ok;
      console.log(`[IFTTT] ${iftttOk ? "OK" : "NG"}`);
    }
  } catch (e) {
    iftttError = e?.response?.data || e;
    console.error("[IFTTT] error", iftttError);
  }

  // ===== YouTube =====
  let ytOk = false;
  let ytError = null;
  if (skipYouTube) {
    console.log("[YT] SKIP → skipped due to YT_SK prefix");
    ytOk = true; // スキップは成功として扱う
  } else {
    try {
      if (DRY_RUN === "1") {
        console.log("[YT] DRY_RUN → skip");
        ytOk = true;
      } else {
        const ytRes = await uploadYouTube({
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          refreshToken: ytAcc.refreshToken,
          sourceUrl: url,
          title: ytTitle,
          description: ytDescription,
          privacyStatus: "public",
          dailyLimit: parseInt(YT_DAILY_LIMIT, 10),
        });
        ytOk = ytRes.ok;
        console.log(
          `[YT] ${ytOk ? "OK" : "NG"} videoId=${ytRes.videoId || "-"}`
        );
      }
    } catch (e) {
      ytError = e;
      const errorData = e?.response?.data || e;
      console.error("[YT] error", errorData);
    }
  }

  // ===== Instagram =====
  let igOk = false;
  let igError = null;
  if (skipInstagram) {
    console.log("[IG] SKIP → skipped due to YT_IG_SK prefix");
    igOk = true; // スキップは成功として扱う
  } else {
    try {
      if (DRY_RUN === "1") {
        console.log("[IG] DRY_RUN → skip");
        igOk = true;
      } else {
        const igRes = await postInstagram({
          igUserId: igAcc.userId,
          accessToken: igAcc.accessToken,
          mediaUrl: url,
          caption,
        });
        igOk = igRes.ok;
        console.log(`[IG] ${igOk ? "OK" : "NG"} id=${igRes.id || "-"}`);
      }
    } catch (e) {
      igError = e?.response?.data || e;
      console.error("[IG] error", igError);
    }
  }

  // ===== Facebook Pages =====
  let fbOk = false;
  let fbError = null;
  //   const skipFacebook = skipInstagram || !fbAcc;
  // if (skipInstagram) {
  // TODO: 一時的にFacebookをスキップ（不具合調査中）
  const skipFacebook = true; // skipInstagram || !fbAcc;
  if (true) {
    console.log("[FB] SKIP → temporarily skipped (bug investigation)");
    fbOk = true; // スキップは成功として扱う
  } else if (skipInstagram) {
    console.log("[FB] SKIP → skipped due to YT_IG_SK prefix");
    fbOk = true; // スキップは成功として扱う
  } else if (!fbAcc) {
    console.log("[FB] SKIP → no Facebook Pages configured");
    fbOk = true; // 未設定は成功として扱う
  } else {
    try {
      if (DRY_RUN === "1") {
        console.log("[FB] DRY_RUN → skip");
        fbOk = true;
      } else {
        const fbRes = await postFacebookReel({
          pageId: fbAcc.pageId,
          accessToken: fbAcc.accessToken,
          videoUrl: url,
          caption,
        });
        fbOk = fbRes.ok;
        console.log(`[FB] ${fbOk ? "OK" : "NG"} id=${fbRes.id || "-"}`);
      }
    } catch (e) {
      fbError = e?.response?.data || e;
      console.error("[FB] error", fbError);
    }
  }

  // ===== どれか一つでも成功したら削除 =====
  // スキップされていないプラットフォームの成功状態を確認
  const anySuccess =
    (!skipInstagram && igOk) ||
    (!skipFacebook && fbOk) ||
    (!skipYouTube && ytOk) ||
    iftttOk;

  const willDelete = anySuccess;

  // ===== ステータスをSlackに送信 =====
  await sendSlackMessage({
    videoKey: key,
    ig: igOk,
    igError: igError,
    skipInstagram: skipInstagram,
    ifttt: iftttOk,
    iftttError: iftttError,
    fb: fbOk,
    fbError: fbError,
    skipFacebook: skipFacebook,
    yt: ytOk,
    ytError: ytError,
    skipYouTube: skipYouTube,
    willDelete: willDelete,
  });

  if (willDelete) {
    console.log(
      `[DELETE] At least one post succeeded. Video deletion scheduled for 30 seconds: ${key}`
    );
    setTimeout(() => {
      deleteVideo(key, "delayed");
    }, 30000); // 30秒 = 30000ms
  } else {
    console.log(
      `[KEEP] kept: ${key} (IG:${igOk} / FB:${fbOk} / YT:${ytOk} / IFTTT:${iftttOk})`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
