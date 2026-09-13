"""Read Nokia CDoc PDF tables by word geometry.

Two things make these tables awkward:

  * the footnote markers are glued to the values in any flattened text — "342"
    is 34 with footnote 2, "2503" is 250 with footnote 3. The markers are set
    at 5 pt against 8 pt body text, so a size filter removes them cleanly and
    no regex has to guess.
  * cells are vertically centred, so a row's short cells sit on the middle
    line of its tallest cell, and a blank line separates rows.

So: work in PDF coordinates, group words into cells by horizontal gap, assign
cells to columns by x, and group lines into rows by vertical gap.
"""
import statistics

BODY_MIN_SIZE = 6.5     # drops 5 pt footnote markers and subscripts
CELL_GAP = 6.0          # pt between words that ends a cell
ROW_GAP = 1.6           # multiple of line height that ends a row


def lines_of(page, min_size=BODY_MIN_SIZE):
    """[(top, [(x0, x1, text), ...]), ...] — one entry per visual line."""
    words = [w for w in page.extract_words(extra_attrs=["size"], x_tolerance=1.5)
             if w["size"] > min_size and w["text"].strip()]
    buckets = {}
    for w in words:
        buckets.setdefault(round(w["top"] / 2.0), []).append(w)
    out = []
    for key in sorted(buckets):
        row = sorted(buckets[key], key=lambda w: w["x0"])
        out.append((min(w["top"] for w in row),
                    [(w["x0"], w["x1"], w["text"]) for w in row]))
    return out


def to_cells(words, gap=CELL_GAP):
    """Merge words on one line into cells: [(x0, text), ...]."""
    cells, cur, cur_x, last_x1 = [], [], None, None
    for x0, x1, t in words:
        if cur and x0 - last_x1 > gap:
            cells.append((cur_x, " ".join(cur)))
            cur, cur_x = [], None
        if cur_x is None:
            cur_x = x0
        cur.append(t)
        last_x1 = x1
    if cur:
        cells.append((cur_x, " ".join(cur)))
    return cells


def assign(cells, columns):
    """Map cells onto named columns. `columns` is [(x_start, name), ...]."""
    out = {}
    for x, text in cells:
        name = columns[0][1]
        for cx, n in columns:
            if x >= cx - 4:
                name = n
        out[name] = (out.get(name, "") + " " + text).strip()
    return out


def rules(page):
    """Tops of the horizontal rules that separate this table's rows.

    Row height varies with the tallest cell, and a multi-line description can
    be spaced exactly like two single-line rows, so no gap threshold separates
    rows reliably. The rules do it exactly, and CDoc draws one under every row.
    """
    return sorted({round(l["top"], 1) for l in page.lines
                   if abs(l["y0"] - l["y1"]) < 0.6})


def table_rows(pages, columns, marks=False):
    """Rows across a run of pages, split on the rules drawn under each row.

    With marks=True each row also gets a "_marks" entry mapping a column to the
    footnote numbers attached to its text. The markers are the same 5 pt glyphs
    the body pass drops, and in this guide they carry real information — notes
    7 and 8 on Table 7-147 are what tell you a card is two or three slots wide.
    """
    out = []
    for page in pages:
        bands = rules(page)
        if len(bands) < 2:
            continue
        grouped = {}
        for top, words in lines_of(page):
            if top < bands[0] or top > bands[-1]:
                continue                       # page header and footer
            grouped.setdefault(max(b for b in bands if b <= top), []).append(words)
        small = _small_digits(page) if marks else []
        for band in sorted(grouped):
            rec = {}
            for words in grouped[band]:
                for k, v in assign(to_cells(words), columns).items():
                    rec[k] = (rec.get(k, "") + " " + v).strip()
            if not rec:
                continue
            if marks:
                below = [b for b in bands if b > band]
                bottom = below[0] if below else bands[-1]
                rec["_marks"] = _marks_in(small, band, bottom, columns)
            out.append(rec)
    return out


def _small_digits(page):
    """Every sub-body-size digit run on the page, with position."""
    return [w for w in page.extract_words(extra_attrs=["size"], x_tolerance=1.5)
            if w["size"] <= BODY_MIN_SIZE and w["text"].strip().isdigit()]


def _marks_in(small, top, bottom, columns):
    """Footnote numbers inside one row band, grouped by column."""
    out = {}
    for w in small:
        if not (top <= w["top"] < bottom):
            continue
        name = columns[0][1]
        for cx, n in columns:
            if w["x0"] >= cx - 4:
                name = n
        out.setdefault(name, []).append(int(w["text"]))
    return out


def header_columns(page, names, gap=CELL_GAP):
    """Find the x of each header label on a page; returns [(x, name), ...]."""
    found = {}
    for _, words in lines_of(page):
        for x, text in to_cells(words, gap):
            flat = text.replace(" ", "").lower()
            for n in names:
                if n not in found and flat.startswith(n.replace(" ", "").lower()):
                    found[n] = x
    return sorted((x, n) for n, x in found.items())
