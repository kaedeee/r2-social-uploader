import axios from "axios";

// https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media#creating

export async function postInstagram({
  igUserId,
  accessToken,
  mediaUrl,
  caption,
}) {
  // 1) コンテナ作成
  const create = await axios.post(
    `https://graph.facebook.com/v20.0/${igUserId}/media`,
    null,
    {
      params: {
        access_token: accessToken,
        media_type: "REELS",
        video_url: mediaUrl,
        audio_name: "プロフは見ちゃダメ！",
        // collaborators: ["kaedeee_buzz"],
        caption,
        share_to_feed: false,
        thumb_offset: 2500,
      },
      timeout: 60000,
    }
  );
  const creationId = create.data.id;
  // 2) ステータス待ち
  let status = "IN_PROGRESS";
  const start = Date.now();
  while (status === "IN_PROGRESS") {
    await new Promise((r) => setTimeout(r, 2000));
    const q = await axios.get(
      `https://graph.facebook.com/v20.0/${creationId}`,
      {
        params: { fields: "status_code", access_token: accessToken },
        timeout: 30000,
      }
    );
    status = q.data.status_code || "IN_PROGRESS";
    if (Date.now() - start > 5 * 60 * 1000)
      throw new Error("IG: timeout waiting container");
  }
  if (status !== "FINISHED") {
    throw new Error(`IG: container status ${status}`);
  }

  const processingTime = Math.round((Date.now() - start) / 1000);
  console.log(
    `IG: Container processing completed in ${processingTime} seconds`
  );

  // 3) publish
  const pub = await axios.post(
    `https://graph.facebook.com/v20.0/${igUserId}/media_publish`,
    null,
    {
      params: { access_token: accessToken, creation_id: creationId },
      timeout: 60000,
    }
  );

  return { ok: !!pub.data.id, id: pub.data.id };
}
