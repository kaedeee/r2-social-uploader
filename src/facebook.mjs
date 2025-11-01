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
    if (!videoId) {
      throw new Error("Failed to get video_id from initialization");
    }

    console.log(`FB: Video ID obtained: ${videoId}`);

    // Step 2: Upload video using file_url with transfer phase
    // Use upload_phase: "transfer" to upload the video via file_url
    const transferResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${pageId}/video_reels`,
      null,
      {
        params: {
          access_token: accessToken,
          upload_phase: "transfer",
          file_url: videoUrl,
        },
        timeout: 120000, // 2 minutes for upload
      }
    );

    if (!transferResponse.data.success) {
      throw new Error("Failed to transfer video");
    }

    console.log(`FB: Video transfer initiated successfully`);

    // Step 3: Wait for processing to complete
    let processingComplete = false;
    const start = Date.now();
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max wait

    while (!processingComplete && Date.now() - start < maxWaitTime) {
      await new Promise((r) => setTimeout(r, 5000)); // Check every 5 seconds

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
      const videoStatus = status?.video_status;
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

      // Check if processing has started (not_started -> in_progress -> complete)
      const processingStatus = processingPhase?.status;

      // If processing hasn't started yet after upload_complete, wait a bit more
      if (
        videoStatus === "upload_complete" &&
        processingStatus === "not_started"
      ) {
        console.log(
          `FB: Upload complete but processing not started yet, waiting...`
        );
      }

      // Processing is complete when status is ready or processing phase is complete
      if (videoStatus === "ready" || processingStatus === "complete") {
        processingComplete = true;
      } else if (videoStatus === "failed") {
        throw new Error("FB: Video processing failed");
      }
    }

    if (!processingComplete) {
      throw new Error("FB: Timeout waiting for video processing");
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
