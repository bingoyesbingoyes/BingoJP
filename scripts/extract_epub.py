"""把两本 EPUB（课文 / 单词）抽成 BingoReader 前端要用的 JSON。

**只读**：EPUB 就地读 `data/epub/`，不复制、不修改。产物写到 `data/`。

为什么是「一次性脚本 + 落盘 JSON」而不是前端运行期解析 EPUB：
    · 前端不引 zip / XML 解析，bundle 里只有数据；
    · 抽文的取舍（哪些标签算正文、声调怎么切段）只在一处定义；
    · 学生读的是**内容**，生成物就该和读它的代码分开。

取文规则（对着实际 EPUB 定死，别凭印象改）：
    · 基础文本 = 递归取文本，但**跳过 `<rt>` / `<rp>`**；所以
      `<ruby>李<rp>（</rp><rt>り</rt><rp>）</rp></ruby>さん` 的基础文本是 `李さん`。
    · `<ruby>` 另抽成 `{t, r}` 片段（`r` 是读音），其余文本抽成 `{t}`。
    · 生词表假名栏的 `.accent` / `.accent0` 抽成 `kana_runs`（声调分段）。

用法（在工程根目录下跑）：
    python scripts/extract_epub.py                    # 预演：只打印摘要，不落盘
    python scripts/extract_epub.py --write             # 落盘 data/*.json
    python scripts/extract_epub.py --epub-dir 别的目录  # 换 EPUB 来源

汇总行是中文，Windows 控制台默认 GBK 会炸，所以进来先把 stdout 切到 UTF-8。
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

LESSON_COUNT = 48
LESSONS_PER_UNIT = 4

XHTML = "{http://www.w3.org/1999/xhtml}"

#: 句首说话人，如「李：」「Ａ　甲：」。限定 1–6 字，免得把带冒号的普通句子误切。
SPEAKER = re.compile(r"^([^：:]{1,6})[：:]")
#: 没转掉的记号（振假名 `!x(y)`、声调 `@3`）。数据里不该再有，出现就是导出环节漏了。
LEFT_MARK = re.compile(r"![^!()\s]{1,12}\([^)]+\)")
AT_MARK = re.compile(r"@\d")

#: 应用课文的小标题前缀。后面可能跟一个或两个全角空格（第 22/30/33 课是两个）。
APPLIED = "应用课文"
SPACES = "\u3000 \t\r\n"


def localname(element) -> str:
    return etree.QName(element).localname


def text_excluding(element, skip=("rt", "rp")) -> str:
    """递归取文本，但整棵 `skip` 子树（含其 text / tail 之外的子孙）都不算。

    注意 tail 归父级：`<ruby>` 本身的 tail 是紧跟其后的正文，要留下。
    """
    out: list[str] = []

    def walk(node) -> None:
        if localname(node) in skip:
            return
        if node.text:
            out.append(node.text)
        for child in node:
            walk(child)
            if child.tail:
                out.append(child.tail)

    walk(element)
    return "".join(out)


def ruby_reading(element) -> str:
    return "".join("".join(rt.itertext()) for rt in element.findall(f".//{XHTML}rt"))


def segments(element) -> list[dict]:
    """把一段 XML 抽成 `Seg[]`。

    相邻的纯文本会合并，免得一个句子碎成几十段；`<ruby>` 单独成段。
    """
    segs: list[dict] = []

    def add(text: str, reading: str | None = None) -> None:
        if not text:
            return
        if reading is None:
            if segs and "r" not in segs[-1]:
                segs[-1]["t"] += text
            else:
                segs.append({"t": text})
        else:
            segs.append({"t": text, "r": reading})

    def walk(node) -> None:
        if node.text:
            add(node.text)
        for child in node:
            name = localname(child)
            if name in ("rt", "rp"):
                pass
            elif name == "ruby":
                reading = ruby_reading(child)
                add(text_excluding(child), reading or None)
            else:
                walk(child)
            if child.tail:
                add(child.tail)

    walk(element)
    return segs


def base_text(element) -> str:
    return "".join(seg["t"] for seg in segments(element))


def kana_runs(cell) -> list[dict]:
    """生词表假名栏 → 声调分段。

    EPUB 里长音、促音、拗音都写在同一个 `.accent` / `.accent0` 的 span 里，
    所以直接按 span 切段即可，段内不再分。`mark` 为 None 表示不在声调块内。
    """
    runs: list[dict] = []

    def add(text: str, mark: str | None) -> None:
        if not text:
            return
        if runs and runs[-1]["mark"] == mark:
            runs[-1]["t"] += text
        else:
            runs.append({"t": text, "mark": mark})

    def walk(node, mark: str | None) -> None:
        if node.text:
            add(node.text, mark)
        for child in node:
            child_mark = child.get("class") if localname(child) == "span" else mark
            walk(child, child_mark)
            if child.tail:
                add(child.tail, mark)

    walk(cell, None)
    return runs


def drop_prefix(segs: list[dict], count: int) -> list[dict]:
    """从片段序列开头去掉 `count` 个基础字符（用来剥句首说话人）。"""
    out: list[dict] = []
    left = count
    for seg in segs:
        text = seg["t"]
        if left <= 0:
            out.append(dict(seg))
            continue
        if len(text) <= left:
            left -= len(text)
            continue
        trimmed = {"t": text[left:]}
        left = 0
        if "r" in seg:
            trimmed["r"] = seg["r"]
        out.append(trimmed)
    return out


def lstrip_spaces(segs: list[dict]) -> list[dict]:
    out: list[dict] = []
    started = False
    for seg in segs:
        text = seg["t"]
        if not started:
            text = text.lstrip(SPACES)
            if not text:
                continue
            started = True
        item = {"t": text}
        if "r" in seg:
            item["r"] = seg["r"]
        out.append(item)
    return out


def split_speaker(segs: list[dict], text: str) -> tuple[str | None, list[dict]]:
    match = SPEAKER.match(text)
    if not match:
        return None, segs
    return match.group(1), drop_prefix(segs, match.end())


def split_speaker_text(text: str) -> tuple[str | None, str]:
    match = SPEAKER.match(text)
    if not match:
        return None, text
    return match.group(1), text[match.end():]


def parse_lesson(data: bytes, lesson_id: int) -> dict:
    root = etree.fromstring(data)
    body = root.find(f"{XHTML}body")
    if body is None:
        raise ValueError(f"第 {lesson_id} 课没有 body")

    blocks = [child for child in body if localname(child) in ("h2", "h3", "p")]
    if len(blocks) < 2:
        raise ValueError(f"第 {lesson_id} 课标题结构不对：{len(blocks)} 个块")

    title_ja = segments(blocks[0])
    title_zh = base_text(blocks[1])
    cursor = 2

    sections: list[dict] = []
    while cursor < len(blocks):
        if cursor + 1 >= len(blocks):
            raise ValueError(f"第 {lesson_id} 课第 {len(sections) + 1} 节缺中文标题")
        head_ja, head_zh = blocks[cursor], blocks[cursor + 1]
        if localname(head_ja) != "h2" or localname(head_zh) != "h3":
            raise ValueError(f"第 {lesson_id} 课第 {len(sections) + 1} 节标题不是 h2/h3")
        cursor += 2

        section_ja = segments(head_ja)
        section_zh = base_text(head_zh)
        subtitle = None
        if base_text(head_ja).startswith(APPLIED):
            subtitle = lstrip_spaces(drop_prefix(segments(head_ja), len(APPLIED)))
            section_ja = [{"t": APPLIED}]

        sentences: list[dict] = []
        while cursor < len(blocks) and localname(blocks[cursor]) == "p":
            if cursor + 1 >= len(blocks):
                raise ValueError(f"第 {lesson_id} 课有一句缺中文译文")
            src, dst = blocks[cursor], blocks[cursor + 1]
            if dst.get("class") != "dst":
                raise ValueError(f"第 {lesson_id} 课有一句没跟译文，下一块是 {dst.get('class')}")
            cursor += 2

            ja_segments = segments(src)
            speaker, ja_segments = split_speaker(ja_segments, base_text(src))
            _, zh = split_speaker_text(base_text(dst))
            sentences.append({"ja": ja_segments, "zh": zh, "speaker": speaker})

        if not sentences:
            raise ValueError(f"第 {lesson_id} 课的「{section_zh}」一句都没有")
        sections.append(
            {
                "title_ja": section_ja,
                "subtitle_ja": subtitle,
                "title_zh": section_zh,
                "sentences": sentences,
            }
        )

    if len(sections) != 3:
        raise ValueError(f"第 {lesson_id} 课有 {len(sections)} 节，预期 3 节")

    return {
        "id": lesson_id,
        "part": "upper" if lesson_id <= 24 else "lower",
        "unit": (lesson_id - 1) // LESSONS_PER_UNIT + 1,
        "title_ja": title_ja,
        "title_zh": title_zh,
        "sections": sections,
    }


def parse_vocab_lesson(data: bytes, lesson_id: int) -> dict:
    root = etree.fromstring(data)
    headings = root.findall(f".//{XHTML}h2")
    if not headings:
        raise ValueError(f"第 {lesson_id} 课生词表没有 h2")
    header = base_text(headings[0])
    match = re.search(r"（(\d+)\s*词）", header)
    if not match:
        raise ValueError(f"第 {lesson_id} 课生词表表头读不出词数：{header!r}")
    declared = int(match.group(1))

    rows = root.findall(f".//{XHTML}table[@class='words']/{XHTML}tbody/{XHTML}tr")
    words: list[dict] = []
    for row in rows:
        kana_cell = row.find(f"{XHTML}td[@class='kana']")
        word_cell = row.find(f"{XHTML}td[@class='word']")
        pos_cell = row.find(f"{XHTML}td[@class='pos']")
        zh_cell = row.find(f"{XHTML}td[@class='zh']")
        if None in (kana_cell, word_cell, pos_cell, zh_cell):
            raise ValueError(f"第 {lesson_id} 课生词表有一行缺列")

        kana = "".join(kana_cell.itertext())
        runs = kana_runs(kana_cell)
        if "".join(run["t"] for run in runs) != kana:
            raise ValueError(f"第 {lesson_id} 课声调切段和假名对不上：{kana!r}")

        words.append(
            {
                "word": segments(word_cell),
                "kana": kana,
                "kana_runs": runs,
                "pos": base_text(pos_cell),
                "zh": base_text(zh_cell),
            }
        )

    if len(words) != declared:
        raise ValueError(f"第 {lesson_id} 课表头说 {declared} 词，表里 {len(words)} 行")
    return {"id": lesson_id, "declared_count": declared, "words": words}


def markers(lessons: list[dict], vocab: list[dict]) -> list[str]:
    """还没转掉的记号。返回例子（空 = 干净）。"""
    examples: list[str] = []
    texts: list[str] = []
    for lesson in lessons:
        texts.append("".join(seg["t"] for seg in lesson["title_ja"]))
        texts.append(lesson["title_zh"])
        for section in lesson["sections"]:
            for key in ("title_ja", "subtitle_ja"):
                if section[key]:
                    texts.append("".join(seg["t"] for seg in section[key]))
            texts.append(section["title_zh"])
            for sentence in section["sentences"]:
                texts.append("".join(seg["t"] for seg in sentence["ja"]))
                texts.append(sentence["zh"])
    for lesson in vocab:
        for word in lesson["words"]:
            texts.append("".join(seg["t"] for seg in word["word"]))
            texts.append(word["kana"] + word["pos"] + word["zh"])

    for text in texts:
        if LEFT_MARK.search(text) or AT_MARK.search(text):
            examples.append(text[:40])
            if len(examples) >= 3:
                break
    return examples


def read_zip(directory: Path, name: str) -> zipfile.ZipFile:
    path = directory / name
    if not path.exists():
        raise SystemExit(f"找不到 EPUB：{path}")
    return zipfile.ZipFile(path)


def build(epub_dir: Path) -> tuple[dict, dict]:
    text_zip = read_zip(epub_dir, TEXT_EPUB)
    word_zip = read_zip(epub_dir, WORD_EPUB)

    lessons: list[dict] = []
    vocab: list[dict] = []
    for lesson_id in range(1, LESSON_COUNT + 1):
        member = f"OEBPS/lesson{lesson_id:03d}.xhtml"
        lessons.append(parse_lesson(text_zip.read(member), lesson_id))
        vocab.append(parse_vocab_lesson(word_zip.read(member), lesson_id))

    bad = markers(lessons, vocab)
    if bad:
        raise SystemExit(f"抽出来的文本还有没转掉的记号：{bad}")

    book = {
        "book": "新版中日交流标准日本语 初级（上·下册）",
        "source": TEXT_EPUB,
        "lessons": lessons,
    }
    return book, {"lessons": vocab}


def summarize(book: dict, vocab: dict) -> None:
    lessons = book["lessons"]
    sentences = sum(len(s["sentences"]) for l in lessons for s in l["sections"])
    words = sum(len(v["words"]) for v in vocab["lessons"])
    speakers = sum(
        1
        for l in lessons
        for s in l["sections"]
        for sentence in s["sentences"]
        if sentence["speaker"]
    )
    ruby = sum(
        1
        for l in lessons
        for s in l["sections"]
        for sentence in s["sentences"]
        for seg in sentence["ja"]
        if "r" in seg
    )

    print(f"课数      {len(lessons)}（上册 {sum(1 for l in lessons if l['part'] == 'upper')} / 下册 {sum(1 for l in lessons if l['part'] == 'lower')}）")
    print(f"节数      {sum(len(l['sections']) for l in lessons)}")
    print(f"句子      {sentences}（带说话人 {speakers}）")
    print(f"注音片段  {ruby}")
    print(f"词条      {words}")
    print(f"声调块    {sum(1 for v in vocab['lessons'] for w in v['words'] if any(r['mark'] for r in w['kana_runs']))}")
    print()

    sample = lessons[0]
    print(f"—— 第 {sample['id']} 课 {''.join(s['t'] for s in sample['title_ja'])}　{sample['title_zh']}")
    for section in sample["sections"]:
        head = "".join(seg["t"] for seg in section["title_ja"])
        if section["subtitle_ja"]:
            head += "　" + "".join(seg["t"] for seg in section["subtitle_ja"])
        print(f"  [{head}] {len(section['sentences'])} 句")
        for sentence in section["sentences"][:2]:
            ja = "".join(seg["t"] for seg in sentence["ja"])
            speaker = f"{sentence['speaker']}：" if sentence["speaker"] else ""
            print(f"    {speaker}{ja}")
            print(f"      {sentence['zh']}")
    print()

    first = vocab["lessons"][0]
    print(f"—— 第 {first['id']} 课生词表（{first['declared_count']} 词），前 3 条：")
    for word in first["words"][:3]:
        runs = " ".join(
            f"{run['t']}{'·' + run['mark'] if run['mark'] else ''}" for run in word["kana_runs"]
        )
        print(f"    {word['kana']} | {runs} | {''.join(s['t'] for s in word['word'])} | {word['pos']} | {word['zh']}")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="把两本 EPUB 抽成 BingoReader 的 lessons.json / vocab.json")
    parser.add_argument("--epub-dir", type=Path, default=APP / "data" / "epub",
                        help="放着两本 EPUB 的目录（默认 %(default)s）")
    parser.add_argument("--out-dir", type=Path, default=APP / "data",
                        help="JSON 落盘目录（默认 %(default)s）")
    parser.add_argument("--write", action="store_true", help="真的落盘；不加只预演")
    args = parser.parse_args()

    print(f"EPUB 来源：{args.epub_dir}\n")
    book, vocab = build(args.epub_dir)
    summarize(book, vocab)

    if not args.write:
        print("预演完成（没有写文件）。加 --write 落盘。")
        return

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name, payload in (("lessons.json", book), ("vocab.json", vocab)):
        path = args.out_dir / name
        path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"写出 {path}（{path.stat().st_size / 1024:.0f} KB）")


if __name__ == "__main__":
    main()
