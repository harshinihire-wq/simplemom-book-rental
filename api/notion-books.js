// api/notion-books.js
const NOTION_SECRET = process.env.NOTION_SECRET;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

function txt(p) {
  if (!p) return "";
  const arr = p.type === "title" ? p.title : p.rich_text;
  return (arr || []).map(x => x.plain_text || "").join("").trim();
}
function sel(p) {
  if (!p) return "";
  if (p.type === "select") return p.select?.name || "";
  if (p.type === "multi_select") return (p.multi_select || []).map(o => o.name).join(", ");
  return "";
}
function num(p) {
  return (p && typeof p.number === "number") ? p.number : 0;
}
function bool(p) {
  return p?.type === "checkbox" ? !!p.checkbox : !!p?.number;
}
function findProp(props, names) {
  for (const name of names) {
    if (props[name]) return props[name];
    const lower = Object.keys(props).find(k => k.toLowerCase() === name.toLowerCase());
    if (lower) return props[lower];
  }
  return undefined;
}

// Fetch ALL pages from Notion (handles >100 results)
async function fetchAllPages() {
  let all = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const res = await fetch(`${NOTION_API}/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_SECRET}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 100,
        start_cursor: startCursor,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API error: ${text}`);
    }

    const data = await res.json();
    all = all.concat(data.results || []);
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  return all;
}

export default async function handler(req, res) {
  try {
    if (!NOTION_SECRET || !NOTION_DATABASE_ID) {
      return res.status(500).json({ error: "Missing NOTION_SECRET or NOTION_DATABASE_ID" });
    }

    const results = await fetchAllPages();
    const books = results.map(page => {
      const p = page.properties || {};
      const titleP = findProp(p, ["Title", "Name"]);
      const authorP = findProp(p, ["Author", "Authors"]);
      const typeP = findProp(p, ["Type", "Genre", "Category"]);
      const ageP = findProp(p, ["Age group", "Age", "AgeGroup"]);
      const descP = findProp(p, ["Description", "Blurb", "About"]);
      const priceP = findProp(p, ["Price", "Amount"]);
      const copiesP = findProp(p, ["Copies", "Stock"]);
      const rentedP = findProp(p, ["Rented", "Out", "Issued"]);
      const imageP = findProp(p, ["Image", "Cover"]);

      let image = "";
      if (imageP?.type === "files" && imageP.files?.length) {
        const f = imageP.files[0];
        image = f?.external?.url || f?.file?.url || "";
      }
      if (!image && page.cover) {
        image = page.cover.external?.url || page.cover.file?.url || "";
      }

      return {
        id: page.id,
        title: txt(titleP),
        author: txt(authorP),
        genre: sel(typeP) || txt(typeP),
        ageRange: sel(ageP) || txt(ageP),
        blurb: txt(descP),
        image,
        price: num(priceP) || 0,
        copies: num(copiesP) || 1,
        rented: bool(rentedP),
      };
    });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(books);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
