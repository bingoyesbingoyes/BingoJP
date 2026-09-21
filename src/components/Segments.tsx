/** 把 `Seg[]` 渲染出来：带读音的片段出 `<ruby>`，其余出纯文本。
 *
 *  读音一律转成平假名再显示（教材原文的外来语读音是片假名）。
 *
 *  **注音关掉时也照旧渲染 `<rt>`**，只是给它打上 `data-off`（CSS 里换成了
 *  `visibility: hidden`）。理由写在 base.css：删掉 rt 会让行高与字宽一起变，
 *  正文就会在按下开关的瞬间重排、上下跳；藏起来则一个像素都不动。
 *
 *  「读音比汉字宽」的片段（`JC` → ジェーシー）尤其经不起删——那一段会缩短，
 *  整行可能重排成另一行数。藏起来就没有这个问题。
 */

import { Fragment } from "react";
import type { Seg } from "../features/types";

const KATAKANA = /[\u30a1-\u30f6]/g;

function toHiragana(text: string): string {
  return text.replace(KATAKANA, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

interface SegmentsProps {
  segs: Seg[];
  /** 是否显示读音（注音开关）。关掉只是把字藏了，位置照样留着。 */
  reading: boolean;
}

export function Segments({ segs, reading }: SegmentsProps) {
  return (
    <>
      {segs.map((seg, index) => {
        if (!seg.r) return <Fragment key={index}>{seg.t}</Fragment>;
        return (
          <ruby key={index}>
            {seg.t}
            <rt data-off={reading ? undefined : true}>{toHiragana(seg.r)}</rt>
          </ruby>
        );
      })}
    </>
  );
}
