// api/notion-books.js
const NOTION_SECRET = process.env.NOTION_SECRET;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/* ---------- helpers ---------- */
const txt = p => {
  if (!p) return "";
  const arr = p.type === "title" ? p.title : p.rich_text;
  return (arr || []).map(x => x.plain_text || "").join("").trim();
};
const sel = p => {
  if (!p) return "";
  if (p.type === "select") return p.select?.name || "";
  if (p.type === "multi_select") return (p.multi_select || []).map(o => o.name).join(", ");
  return "";
};
const num = p => (p && typeof p.number === "number" ? p.number : 0);
const bool = p => (p?.type === "checkbox" ? !!p.checkbox : !!p?.number);
const findProp = (props, names) => {
  for (const n of names) {
    if (props[n]) return props[n];
    const k = Object.keys(props).find(x => x.toLowerCase() === n.toLowerCase());
    if (k) return props[k];
  }
  return undefined;
};
// ✅ always return the real Notion title column
const titleProp = (props) => {
  if (props.Name) return props.Name;      // common
  if (props.Title) return props.Title;    // sometimes used
  return Object.values(props).find(p => p?.type === "title");
};

/* ---------- fetch all pages with pagination ---------- */
async function fetchAll() {
  const headers = {
    "Authorization": `Bearer ${NOTION_SECRET}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
  let all = [];
  let start_cursor = undefined;
  while (true) {
    const r = await fetch(`${NOTION_API}/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ page_size: 100, start_cursor })
    });
    if (!r.ok) throw new Error(`Notion error ${r.status}: ${await r.text()}`);
    const data = await r.json();
    all = all.concat(data.results || []);
    if (data.has_more && data.next_cursor) start_cursor = data.next_cursor;
    else break;
  }
  return all;
}

/* ---------- handler ---------- */
export default async function handler(req, res) {
  try {
    if (!NOTION_SECRET || !NOTION_DATABASE_ID) {
      return res.status(500).json({ error: "Missing NOTION_SECRET or NOTION_DATABASE_ID" });
    }

    const results = await fetchAll();
    const books = results.map(page => {
      const p = page.properties || {};

      const tP      = titleProp(p);                                   // ✅ title
      const authorP = findProp(p, ["Author", "Authors"]);
      const typeP   = findProp(p, ["Type", "Genre", "Category"]);
      const ageP    = findProp(p, ["Age group", "Age", "AgeGroup"]);
      const descP   = findProp(p, ["Description", "Blurb", "About"]);
      const copiesP = findProp(p, ["Copies", "Stock"]);
      const rentedP = findProp(p, ["Rented", "Out", "Issued"]);

      // ✅ your new columns (exact names from your screenshot)
      const mrpP    = findProp(p, ["MRP"]);         // Number
      const rentP   = findProp(p, ["Rent at"]);     // Number

      // image (files/Cover/page cover)
      const imageP  = findProp(p, ["Image", "Cover"]);
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
        title: txt(tP),                    // ✅ will always be filled now
        author: txt(authorP),
        genre: sel(typeP) || txt(typeP),
        ageRange: sel(ageP) || txt(ageP),
        blurb: txt(descP),
        image,
        copies: num(copiesP) || 1,
        rented: bool(rentedP) ? 1 : 0,

        // ✅ prices
        mrp:  num(mrpP)  || 0,
        rent: num(rentP) || 0
      };
    });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(books);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
