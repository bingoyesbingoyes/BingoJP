"""BingoReader 数据闸门：体检 `data/lessons.json` 与 `vocab.json`。

退出码就是结论：0 = 全过，1 = 有 FAIL。

查什么——都是「错了就是真错」的硬指标：
    · 48 课、id 1–48 连续、单元 1–12 且每单元 4 课、上册 1–24 / 下册 25–48
    · 每课恰 3 节（基本课文 / 基本会话 / 应用课文），每节至少 1 句
    · 总句 1236、句句有中文译文、每课基本课文恰 4 句
    · 每个片段序列拼接非空；没有没转掉的 `!x(y)` / `@N` 记号
    · 词条 2132 条；假名切段拼回来等于整词；词性落在闭合的 13 个值里；
      表头声明的词数 == 表里实际行数
    · 两本书（课文 / 单词）逐课课名的基础文本一致

**独立读一遍 EPUB**（不复用 extract_epub.py 的解析）：否则抽取脚本的同一个 bug
会同时写坏数据又放过自己，闸门就成了摆设。

用法（在工程根目录下跑）：
    python scripts/check_data.py                       # 体检 data/
    python scripts/check_data.py --data-dir 别的目录
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

from lxml import etree

APP = Path(__file__).resolve().parent.parent

TEXT_EPUB = "新版中日交流标准日本语-初级上下册-课文-修正.zh.compact.epub"
WORD_EPUB = "新版中日交流标准日本语-初级上下册-单词-修正.epub"

XHTML = "{http://www.w3.org/1999/xhtml}"
LESSON_COUNT = 48
UNIT_COUNT = 12
SENTENCE_COUNT = 1236
WORD_COUNT = 2132

LEFT_MARK = re.compile(r"![^!()\s]{1,12}\([^)]+\)")
AT_MARK = re.compile(r"@\d")

#: 生词表词性的**闭合集合**。多出任何一个都说明词表来源变了，得先看一眼。
EXPECTED_POS = {"名", "代", "副", "动1", "动2", "动3", "形1", "形2", "连", "叹", "疑", "专", "熟语"}

SECTION_ORDER = ["基本课文", "基本会话", "应用课文"]
MARKS = {None, "accent", "accent0"}

results: list[str] = []
passed = True


def check(cond: bool, label: str) -> None:
    global passed
    results.append(("  OK  " if cond else "  FAIL") + "  " + label)
    if not cond:
        passed = False


def seg_text(segs: list[dict]) -> str:
    return "".join(seg.get("t", "") for seg in segs)


def has_mark(text: str) -> bool:
    return bool(LEFT_MARK.search(text) or AT_MARK.search(text))


# ---------------------------------------------------------------- 独立读 EPUB

def base_text(element) -> str:
    """递归取文本、跳过 rt/rp。和 extract_epub.py 里的规则一致，但此处独立实现。"""
    out: list[str] = []

    def walk(node) -> None:
        if etree.QName(node).localname in ("rt", "rp"):
            return
        if node.text:
            out.append(node.text)
        for child in node:
            walk(child)
            if child.tail:
                out.append(child.tail)

    walk(element)
    return "".join(out)


def epub_titles(path: Path, heading: str) -> dict[int, str]:
    """每课标题的基础文本。课文书取 h2[0]，单词书取 h1[0]。"""
    zf = zipfile.ZipFile(path)
    titles: dict[int, str] = {}
    for lesson_id in range(1, LESSON_COUNT + 1):
        root = etree.fromstring(zf.read(f"OEBPS/lesson{lesson_id:03d}.xhtml"))
        nodes = root.findall(f".//{XHTML}{heading}")
        titles[lesson_id] = base_text(nodes[0]) if nodes else ""
    zf.close()
    return titles


def epub_vocab_facts(path: Path) -> dict[int, tuple[int, int]]:
    """（表头声明的词数, 表格实际行数）。"""
    zf = zipfile.ZipFile(path)
    facts: dict[int, tuple[int, int]] = {}
    for lesson_id in range(1, LESSON_COUNT + 1):
        root = etree.fromstring(zf.read(f"OEBPS/lesson{lesson_id:03d}.xhtml"))
        headings = root.findall(f".//{XHTML}h2")
        header = base_text(headings[0]) if headings else ""
        match = re.search(r"（(\d+)\s*词）", header)
        rows = len(root.findall(f".//{XHTML}table[@class='words']/{XHTML}tbody/{XHTML}tr"))
        facts[lesson_id] = (int(match.group(1)) if match else -1, rows)
    zf.close()
    return facts


# ---------------------------------------------------------------- 体检

def check_lessons(lessons: list[dict]) -> None:
    check(len(lessons) == LESSON_COUNT, f"课数 {len(lessons)}（应 {LESSON_COUNT}）")
    check([l["id"] for l in lessons] == list(range(1, LESSON_COUNT + 1)), "id 1–48 连续")

    by_id = {l["id"]: l for l in lessons}
    unit_bad = [l["id"] for l in lessons if l["unit"] != (l["id"] - 1) // 4 + 1]
    check(not unit_bad, f"单元编号 = (课-1)//4+1（异常 {unit_bad[:3]}）")

    units: dict[int, int] = {}
    for lesson in lessons:
        units[lesson["unit"]] = units.get(lesson["unit"], 0) + 1
    check(sorted(units) == list(range(1, UNIT_COUNT + 1)), f"单元 1–12（实际 {sorted(units)}）")
    check(all(count == 4 for count in units.values()), f"每单元 4 课（实际 {units}）")

    part_bad = [l["id"] for l in lessons if l["part"] != ("upper" if l["id"] <= 24 else "lower")]
    check(not part_bad, f"part 上册 1–24 / 下册 25–48（异常 {part_bad[:3]}）")

    empty_title = [l["id"] for l in lessons if not seg_text(l["title_ja"]).strip() or not l["title_zh"].strip()]
    check(not empty_title, f"课名非空（异常 {empty_title[:3]}）")

    order_bad = [
        l["id"] for l in lessons
        if [seg_text(s["title_ja"]) for s in l["sections"]] != SECTION_ORDER
    ]
    check(not order_bad, f"每课恰 3 节且顺序为 {SECTION_ORDER}（异常 {order_bad[:3]}）")

    no_sentence = [l["id"] for l in lessons for s in l["sections"] if not s["sentences"]]
    check(not no_sentence, f"每节至少 1 句（异常 {no_sentence[:3]}）")

    basic_bad = [
        l["id"] for l in lessons
        if len(next(s for s in l["sections"] if seg_text(s["title_ja"]) == "基本课文")["sentences"]) != 4
    ]
    check(not basic_bad, f"每课基本课文恰 4 句（异常 {basic_bad[:3]}）")

    total = sum(len(s["sentences"]) for l in lessons for s in l["sections"])
    check(total == SENTENCE_COUNT, f"总句数 {total}（应 {SENTENCE_COUNT}）")

    no_zh = [
        (l["id"], i) for l in lessons for s in l["sections"]
        for i, sentence in enumerate(s["sentences"]) if not sentence["zh"].strip()
    ]
    check(not no_zh, f"句句有中文译文（缺 {no_zh[:3]}）")

    no_ja = [
        (l["id"], i) for l in lessons for s in l["sections"]
        for i, sentence in enumerate(s["sentences"]) if not seg_text(sentence["ja"]).strip()
    ]
    check(not no_ja, f"句句有日文正文（空 {no_ja[:3]}）")

    # 应用课文必须有副标题，其余两节必须没有
    subtitle_bad = []
    for lesson in lessons:
        for section in lesson["sections"]:
            applied = seg_text(section["title_ja"]) == "应用课文"
            has = bool(section["subtitle_ja"])
            if applied != has or (has and not seg_text(section["subtitle_ja"]).strip()):
                subtitle_bad.append(lesson["id"])
    check(not subtitle_bad, f"应用课文有副标题、其余没有（异常 {subtitle_bad[:3]}）")

    # 完整性与记号残留
    texts: list[str] = []
    for lesson in lessons:
        texts.append(seg_text(lesson["title_ja"]))
        texts.append(lesson["title_zh"])
        for section in lesson["sections"]:
            texts.append(seg_text(section["title_ja"]))
            if section["subtitle_ja"]:
                texts.append(seg_text(section["subtitle_ja"]))
            texts.append(section["title_zh"])
            for sentence in section["sentences"]:
                texts.append(seg_text(sentence["ja"]))
                texts.append(sentence["zh"])
                if any(seg["t"] == "" for seg in sentence["ja"]):
                    texts.append("__EMPTY_SEG__")
                if any("r" in seg and seg["r"] == "" for seg in sentence["ja"]):
                    texts.append("__EMPTY_READING__")
    leftover = [t[:40] for t in texts if has_mark(t)]
    check(not leftover, f"没有没转掉的记号（{leftover[:3]}）")
    check(not any(t == "__EMPTY_SEG__" for t in texts), "没有空片段")
    check(not any(t == "__EMPTY_READING__" for t in texts), "没有空读音")

    speaker = sum(1 for l in lessons for s in l["sections"] for x in s["sentences"] if x["speaker"])
    results.append(f"      —— 带说话人的句子 {speaker} 条")


def check_vocab(vocab_lessons: list[dict], epub_facts: dict[int, tuple[int, int]]) -> None:
    check(len(vocab_lessons) == LESSON_COUNT, f"生词表课数 {len(vocab_lessons)}（应 {LESSON_COUNT}）")
    check([v["id"] for v in vocab_lessons] == list(range(1, LESSON_COUNT + 1)), "生词表 id 1–48 连续")

    total = sum(len(v["words"]) for v in vocab_lessons)
    check(total == WORD_COUNT, f"词条数 {total}（应 {WORD_COUNT}）")

    declared_bad, header_bad, pos_seen, mark_seen, runs_bad, empty_bad, left = [], [], set(), set(), [], [], []
    for lesson in vocab_lessons:
        declared, rows = epub_facts.get(lesson["id"], (-1, -1))
        if lesson["declared_count"] != len(lesson["words"]):
            declared_bad.append((lesson["id"], lesson["declared_count"], len(lesson["words"])))
        if lesson["declared_count"] != declared or declared != rows:
            header_bad.append((lesson["id"], lesson["declared_count"], declared, rows))

        for word in lesson["words"]:
            pos_seen.add(word["pos"])
            joined = "".join(run["t"] for run in word["kana_runs"])
            if joined != word["kana"] or not word["kana"].strip():
                runs_bad.append((lesson["id"], word["kana"], joined))
            for run in word["kana_runs"]:
                mark_seen.add(run["mark"])
            if not seg_text(word["word"]).strip() or not word["zh"].strip():
                empty_bad.append((lesson["id"], seg_text(word["word"]), word["zh"]))
            for piece in (seg_text(word["word"]), word["kana"], word["pos"], word["zh"]):
                if has_mark(piece):
                    left.append(piece[:40])

    check(not declared_bad, f"每课 declared_count == 实际行数（异常 {declared_bad[:3]}）")
    check(not header_bad, f"JSON == EPUB 表头词数 == 表格行数（异常 {header_bad[:3]}）")
    check(pos_seen == EXPECTED_POS, f"词性闭合集合一致（多 {sorted(pos_seen - EXPECTED_POS)} / 少 {sorted(EXPECTED_POS - pos_seen)}）")
    check(mark_seen <= MARKS, f"声调标记只有 null/accent/accent0（实际 {sorted(str(m) for m in mark_seen)}）")
    check(not runs_bad, f"kana_runs 拼回 == kana（异常 {runs_bad[:3]}）")
    check(not empty_bad, f"词条写法/中文非空（异常 {empty_bad[:3]}）")
    check(not left, f"生词表没有没转掉的记号（{left[:3]}）")
    results.append(f"      —— 声调块 {sum(1 for v in vocab_lessons for w in v['words'] if any(r['mark'] for r in w['kana_runs']))} 条")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="体检 BingoReader 抽出来的课程数据")
    parser.add_argument("--data-dir", type=Path, default=APP / "data", help="JSON 所在目录（默认 %(default)s）")
    parser.add_argument("--epub-dir", type=Path, default=APP / "data" / "epub",
                        help="两本 EPUB 所在目录（默认 %(default)s）")
    args = parser.parse_args()

    missing = [name for name in ("lessons.json", "vocab.json") if not (args.data_dir / name).exists()]
    if missing:
        print(f"缺 {missing}——先跑 python scripts/extract_epub.py --write")
        sys.exit(1)

    book = json.loads((args.data_dir / "lessons.json").read_text(encoding="utf-8"))
    vocab = json.loads((args.data_dir / "vocab.json").read_text(encoding="utf-8"))

    results.append(f"=== {args.data_dir / 'lessons.json'}　{book.get('book', '')} ===")
    check_lessons(book["lessons"])
    results.append("")
    results.append(f"=== {args.data_dir / 'vocab.json'} ===")
    check_vocab(vocab["lessons"], epub_vocab_facts(args.epub_dir / WORD_EPUB))
    results.append("")

    # 两本书的课名基础文本逐课一致
    text_titles = epub_titles(args.epub_dir / TEXT_EPUB, "h2")
    word_titles = epub_titles(args.epub_dir / WORD_EPUB, "h1")
    json_titles = {l["id"]: seg_text(l["title_ja"]) for l in book["lessons"]}
    mismatch = [
        lesson_id for lesson_id in range(1, LESSON_COUNT + 1)
        if not (text_titles[lesson_id] == word_titles[lesson_id] == json_titles[lesson_id])
    ]
    check(not mismatch, f"两本书课名基础文本逐课一致（不一致 {mismatch[:3]}）")

    results.append("")
    results.append("全部通过 ✓" if passed else "有 FAIL ✗")
    print("\n".join(results))
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
