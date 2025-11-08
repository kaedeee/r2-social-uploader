import axios from "axios";

// https://developers.facebook.com/docs/video-api/guides/publishing
// バックアップ: 旧 Video API を使用したコード

export async function postFacebookVideo({
  pageId,
  accessToken,
  videoUrl,
  caption,
  apiVersion = "v24.0",
}) {
  try {
    // ページアクセストークンを取得（必要に応じて）
    let pageAccessToken = accessToken;
    try {
      const pageInfo = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${pageId}?fields=access_token&access_token=${accessToken}`
      );
      if (pageInfo.data.access_token) {
        pageAccessToken = pageInfo.data.access_token;
        console.log(`FB: Using page access token for page ${pageId}`);
      }
    } catch (tokenError) {
      // ページアクセストークンの取得に失敗した場合は元のトークンを使用
      console.log(`FB: Using provided access token (page token fetch failed)`);
    }

    // Direct upload using /videos endpoint with file_url
    console.log(`FB: Publishing video from URL: ${videoUrl}`);

    const publishParams = {
      access_token: pageAccessToken,
      file_url: videoUrl,
    };

    if (caption) {
      publishParams.description = caption;
    }

    const publishResponse = await axios.post(
      `https://graph-video.facebook.com/${apiVersion}/${pageId}/videos`,
      null,
      {
        params: publishParams,
        timeout: 120000, // 2 minutes for upload
      }
    );

    const publishedVideoId = publishResponse.data.id;
    if (!publishedVideoId) {
      throw new Error("Failed to publish video");
    }

    console.log(`FB: Video published successfully, ID: ${publishedVideoId}`);

    return { ok: true, id: publishedVideoId };
  } catch (error) {
    console.error("FB: Error details:", error?.response?.data || error.message);
    return {
      ok: false,
      error:
        error?.response?.data?.error?.message ||
        error.message ||
        "Unknown error",
    };
  }
}
