
export default async function handler(req, res) {
  const NOTION_SECRET = process.env.NOTION_SECRET;
  const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
  if (!NOTION_SECRET || !NOTION_DATABASE_ID) {
    res.status(500).json({ error: "Missing NOTION_SECRET or NOTION_DATABASE_ID" });
    return;
  }

  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_SECRET}`,
        "Notion-Version": "2022-06-28",
        "content-type": "application/json"
      },
      body: JSON.stringify({ page_size: 200 })
    });

    if(!r.ok){
      const txt = await r.text();
      res.status(500).json({ error: "Notion query failed", status: r.status, body: txt });
      return;
    }

    const data = await r.json();
    const items = (data.results || []).map(page => {
      const props = page.properties || {};

      function getText(prop) {
        if (!prop) return "";
        switch (prop.type) {
          case "title": return (prop.title?.[0]?.plain_text) || "";
          case "rich_text": return (prop.rich_text || []).map(t => t.plain_text || "").join(" ");
          case "select": return prop.select?.name || "";
          case "multi_select": return (prop.multi_select || []).map(s => s.name).join(", ");
          case "number": return prop.number ?? 0;
          case "url": return prop.url || "";
          default: return "";
        }
      }
      function getFile(prop) {
        const files = prop?.files || [];
        if (files.length && files[0].file?.url) return files[0].file.url;
        if (files.length && files[0].external?.url) return files[0].external.url;
        return "";
      }

      return {
        id: page.id,
        "Title": getText(props["Title"] || props["Name"]),
        "Author": getText(props["Author"]),
        "Type": getText(props["Type"]),
        "Age group": getText(props["Age group"]) || getText(props["ageRange"]),
        "Description": getText(props["Description"] || props["Blurb"]),
        "Copies": Number(getText(props["Copies"]) || 1),
        "Rented": Number(getText(props["Rented"]) || 0),
        "Image": getFile(props["Image"])
      };
    });

    res.setHeader("cache-control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(items);
  } catch (e) {
    res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
