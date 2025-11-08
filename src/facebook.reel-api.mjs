import axios from "axios";

// https://developers.facebook.com/docs/video-api/guides/reels-publishing/

export async function postFacebookReel({
  pageId,
  accessToken,
  videoUrl,
  caption,
  apiVersion = "v24.0",
}) {
  try {
    console.log(`FB: Uploading reel from URL: ${videoUrl}`);

    // Step 1: Initialize an Upload Session
    console.log(`FB: Step 1 - Initializing upload session`);
    const initResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${pageId}/video_reels`,
      {
        upload_phase: "start",
        access_token: accessToken,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const videoId = initResponse.data.video_id;
    const uploadUrl = initResponse.data.upload_url;

    if (!videoId || !uploadUrl) {
      throw new Error("Failed to initialize upload session");
    }

    console.log(`FB: Upload session initialized, video_id: ${videoId}`);

    // Step 2: Upload the Video
    console.log(`FB: Step 2 - Uploading video`);
    const uploadResponse = await axios.post(uploadUrl, null, {
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_url: videoUrl,
      },
      timeout: 120000, // 2 minutes for upload
    });

    if (!uploadResponse.data.success) {
      throw new Error("Video upload failed");
    }

    console.log(`FB: Video uploaded successfully, video_id: ${videoId}`);

    return { ok: true, id: videoId };
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

// Publish an uploaded reel
export async function publishFacebookReel({
  pageId,
  accessToken,
  videoId,
  caption,
  apiVersion = "v24.0",
}) {
  try {
    console.log(`FB: Publishing reel, video_id: ${videoId}`);

    const publishParams = {
      access_token: accessToken,
      video_id: videoId,
      upload_phase: "finish",
      video_state: "PUBLISHED",
    };

    if (caption) {
      publishParams.description = caption;
    }

    const publishResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${pageId}/video_reels`,
      publishParams,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const publishedVideoId = publishResponse.data.id;
    if (!publishedVideoId) {
      throw new Error("Failed to publish reel");
    }

    console.log(`FB: Reel published successfully, ID: ${publishedVideoId}`);

    return { ok: true, id: publishedVideoId };
  } catch (error) {
    console.error(
      "FB: Publish error details:",
      error?.response?.data || error.message
    );
    return {
      ok: false,
      error:
        error?.response?.data?.error?.message ||
        error.message ||
        "Unknown error",
    };
  }
}
