import axios from "axios";

// https://developers.facebook.com/docs/video-api/guides/publishing

export async function postFacebookReel({
  pageId,
  accessToken,
  videoUrl,
  caption,
  apiVersion = "v24.0",
}) {
  try {
    // Direct upload using /videos endpoint with file_url
    console.log(`FB: Publishing video from URL: ${videoUrl}`);

    const publishParams = {
      access_token: accessToken,
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
