import { blockWordCount, inlineWords, type Block } from "@/lib/content-blocks";
import { InlinePlain, InlineWords } from "@/components/inline-text";
import { QuranBlock, HadithBlock } from "@/components/quran-hadith-blocks";

/**
 * العارض الموحد لكتل المقال — محرك التنسيق الموسع:
 * فقرات، عناوين ##/###، اقتباسات، قوائم مرتبة وغير مرتبة، فواصل أفقية،
 * جداول مقارنة GFM، وسوم :::quran :::hadith :::note :::question،
 * وتنسيق مضمن **غامق** *مائل* ~~مشطوب~~ `مصطلح`.
 *
 * نسختان متطابقتان بصريًا:
 * - مع خريطة offsets → وضع الكاريوكي (كل كلمة <span data-wi> للمشغل الصوتي)
 * - بدونه → وضع هادئ للصفحات القانونية والمعاينات
 */

type Opts = { offsets?: Map<string, number> };

function NoteBlock({ block, opts }: { block: Extract<Block, { kind: "note" }>; opts: Opts }) {
  const start = opts.offsets?.get(block.id) ?? 0;
  return (
    <aside id={block.id} className="md-note" dir="rtl">
      <svg aria-hidden className="md-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <div className="md-note-content">
        <span className="md-label">ملاحظة</span>
        <div className="md-note-body">
          {opts.offsets ? <InlineWords raw={block.text} start={start} /> : <InlinePlain raw={block.text} />}
        </div>
      </div>
    </aside>
  );
}

function QuestionBlock({ block, opts }: { block: Extract<Block, { kind: "question" }>; opts: Opts }) {
  const start = opts.offsets?.get(block.id) ?? 0;
  return (
    <figure id={block.id} className="md-question" dir="rtl">
      <svg aria-hidden className="md-question-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
      <figcaption className="md-label">تساؤل</figcaption>
      <div className="md-question-body">
        {opts.offsets ? <InlineWords raw={block.text} start={start} /> : <InlinePlain raw={block.text} />}
      </div>
    </figure>
  );
}

function TableBlock({ block, opts }: { block: Extract<Block, { kind: "table" }>; opts: Opts }) {
  const alignClass = (i: number) =>
    block.aligns[i] === "center" ? "ta-center" : block.aligns[i] === "end" ? "ta-end" : "ta-start";

  /* فهرس الكلمات يمتد عبر خلايا الجدول بترتيب القراءة — بنفس مُجزّئ العرض */
  let acc = opts.offsets?.get(block.id) ?? 0;
  const cellStart = (raw: string) => {
    const s = acc;
    acc += inlineWords(raw).length;
    return s;
  };

  return (
    <div id={block.id} className="md-table-wrap" dir="rtl">
      <table className="md-table">
        <thead>
          <tr>
            {block.head.map((cell, i) => (
              <th key={i} className={alignClass(i)}>
                {opts.offsets ? <InlineWords raw={cell} start={cellStart(cell)} /> : <InlinePlain raw={cell} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={alignClass(c)}>
                  {opts.offsets ? <InlineWords raw={cell} start={cellStart(cell)} /> : <InlinePlain raw={cell} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ArticleBlocks({ blocks, offsets }: { blocks: Block[]; offsets?: Map<string, number> }) {
  const opts: Opts = { offsets };

  return (
    <>
      {blocks.map((block) => {
        const start = offsets?.get(block.id) ?? 0;
        switch (block.kind) {
          case "p":
            return (
              <p key={block.id} id={block.id}>
                {offsets ? <InlineWords raw={block.text} start={start} /> : <InlinePlain raw={block.text} />}
              </p>
            );
          case "h2":
            return (
              <h2 key={block.id} id={block.id}>
                {offsets ? <InlineWords raw={block.text} start={start} /> : <InlinePlain raw={block.text} />}
              </h2>
            );
          case "h3":
            return (
              <h3 key={block.id} id={block.id}>
                {offsets ? <InlineWords raw={block.text} start={start} /> : <InlinePlain raw={block.text} />}
              </h3>
            );
          case "quote":
            return (
              <blockquote key={block.id} id={block.id}>
                {offsets ? <InlineWords raw={block.text} start={start} /> : <InlinePlain raw={block.text} />}
              </blockquote>
            );
          case "list":
          case "olist": {
            let acc = start;
            const items = block.items.map((item, i) => {
              const itemStart = acc;
              acc += inlineWords(item).length;
              return (
                <li key={i}>
                  {offsets ? <InlineWords raw={item} start={itemStart} /> : <InlinePlain raw={item} />}
                </li>
              );
            });
            return block.kind === "list" ? (
              <ul key={block.id} id={block.id}>{items}</ul>
            ) : (
              <ol key={block.id} id={block.id} start={block.start}>{items}</ol>
            );
          }
          case "hr":
            return <hr key={block.id} id={block.id} className="md-hr" />;
          case "table":
            return <TableBlock key={block.id} block={block} opts={opts} />;
          case "note":
            return <NoteBlock key={block.id} block={block} opts={opts} />;
          case "question":
            return <QuestionBlock key={block.id} block={block} opts={opts} />;
          case "quran":
            return <QuranBlock key={block.id} id={block.id} text={block.text} sura={block.sura} ayah={block.ayah} />;
          case "hadith":
            return (
              <HadithBlock
                key={block.id}
                id={block.id}
                text={block.text}
                narrator={block.narrator}
                withPrefix={block.via === "directive"}
              />
            );
        }
      })}
    </>
  );
}

/** تصدير مساعد لتوافق حسابات وقت القراءة الخارجية إن لزم */
export { blockWordCount };
