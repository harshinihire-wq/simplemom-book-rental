export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    hasSecret: !!process.env.NOTION_SECRET,
    hasDb: !!process.env.NOTION_DATABASE_ID
  });
}
