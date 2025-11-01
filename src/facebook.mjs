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
    // Step 1: Initialize upload session
    const initResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${pageId}/video_reels`,
      null,
      {
        params: {
          access_token: accessToken,
          upload_phase: "start",
        },
        timeout: 60000,
      }
    );

    const videoId = initResponse.data.video_id;
    const uploadUrl = initResponse.data.upload_url;
    if (!videoId) {
      throw new Error("Failed to get video_id from initialization");
    }
    if (!uploadUrl) {
      throw new Error("Failed to get upload_url from initialization");
    }

    console.log(`FB: Video ID obtained: ${videoId}`);
    console.log(`FB: Upload URL obtained: ${uploadUrl}`);

    // Step 2: Upload video using file_url
    // According to docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing/
    // For hosted files, use the upload_url from Step 1 with file_url header
    const uploadResponse = await axios.post(uploadUrl, null, {
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_url: videoUrl,
      },
      timeout: 120000, // 2 minutes for upload
    });

    if (!uploadResponse.data.success) {
      throw new Error("Failed to upload video");
    }

    console.log(`FB: Video uploaded successfully`);

    // Step 3: Wait for processing to complete (similar to instagram.mjs)
    let videoStatus = "processing";
    const start = Date.now();
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max wait

    while (
      videoStatus === "processing" ||
      videoStatus === "uploading" ||
      videoStatus === "upload_complete"
    ) {
      await new Promise((r) => setTimeout(r, 2000)); // Check every 2 seconds

      const statusResponse = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${videoId}`,
        {
          params: {
            fields: "status",
            access_token: accessToken,
          },
          timeout: 30000,
        }
      );

      const status = statusResponse.data.status;
      videoStatus = status?.video_status || videoStatus;
      const processingPhase = status?.processing_phase;

      console.log(
        `FB: Video status: ${videoStatus}, Processing: ${processingPhase?.status}`
      );

      if (processingPhase?.error) {
        throw new Error(
          `FB: Processing error: ${
            processingPhase.error.message || "Unknown error"
          }`
        );
      }

      if (videoStatus === "failed") {
        throw new Error("FB: Video processing failed");
      }

      if (Date.now() - start > maxWaitTime) {
        throw new Error("FB: Timeout waiting for video processing");
      }
    }

    if (videoStatus !== "ready") {
      throw new Error(`FB: Unexpected video status: ${videoStatus}`);
    }

    const processingTime = Math.round((Date.now() - start) / 1000);
    console.log(`FB: Video processing completed in ${processingTime} seconds`);

    // Step 4: Publish the reel
    const publishResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${pageId}/video_reels`,
      null,
      {
        params: {
          access_token: accessToken,
          video_id: videoId,
          upload_phase: "finish",
          video_state: "PUBLISHED",
          ...(caption && { description: caption }),
        },
        timeout: 60000,
      }
    );

    const publishedVideoId =
      publishResponse.data.id || publishResponse.data.video_id;
    if (!publishedVideoId) {
      throw new Error("Failed to publish reel");
    }

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
