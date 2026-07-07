import { type Card, type GameState } from "../game";
import { CardView } from "./CardView";
import { SelectedCardDetail } from "./DuelPanel";

const RULE_SECTIONS = [
  {
    title: "勝敗",
    items: [
      "相手のライフを 0 にすると勝利。",
      "山札・手札・場の召喚獣がすべて空になったプレイヤーも敗北。両者同時なら引き分け。",
      "60 手番で決着しない場合は残りライフが多い側の判定勝ち。同点なら引き分け。",
    ],
  },
  {
    title: "ターン",
    items: [
      "通常はターン開始時に 1 枚引き、3 アクションで行動します。",
      "先攻の最初のターンだけ 1 アクション、ドローなし、攻撃不可です。",
    ],
  },
  {
    title: "カード種と属性",
    items: [
      "召喚獣: 場に最大 3 体まで出して攻撃・防御します。",
      "術式: 1 アクションで発動する使い切りの効果カードです。",
      "遺物: 1 枚だけ置ける継続効果カードです。",
      "属性は火・水・風・土。属性相性はなく、カード効果の傾向を示します。",
    ],
  },
  {
    title: "登場とアップグレード",
    items: [
      "召喚獣の通常登場コストは power と同じアクション数です。power 4 はチャージと合わせれば 1 ターンで出せます。",
      "同属性かつ低 power の場の召喚獣を元にアップグレードできます。元カードは新しい召喚獣の下に重ねます。",
      "アップグレードコストは「新しい召喚獣の power − 元の召喚獣の power」、最低 1 アクション。例: power 2 → 4 は 2 アクション。場が埋まっていても入れ替えで実行できます。",
    ],
  },
  {
    title: "チャージ",
    items: [
      "1 ターンに 1 回、手札 1 枚をチャージして残りアクション +1 できます。上限は 4。",
      "チャージできるカードに種類や power の制限はありません。",
      "チャージしたターンは攻撃できません。チャージ時効果はチャージ後に処理します。",
    ],
  },
  {
    title: "攻撃と防御",
    items: [
      "未消耗の召喚獣で攻撃します。攻撃した召喚獣は消耗します。",
      "防がれなかった攻撃は、攻撃した召喚獣の power と同じダメージを与えます（power 1〜4 = 1〜4 点）。",
      "「戦闘時、攻撃値 +1」などの補正は戦闘（防御や討伐の判定）でのみ使われ、ダメージは power で決まります。",
      "攻撃ダメージを受けた側は、受けた点数分カードを引きます（ブレイクドロー）。",
      "攻撃対象には相手プレイヤーのほか、相手の召喚獣も選べます。判定は場防御と同じで、上回れば討伐、同値なら相打ちです。",
      "場防御は同値なら相打ち、上回れば攻撃側だけトラッシュ。防御側は場に残って消耗します。",
      "1 ターンに 1 回、手札の召喚獣で防御できます。防御カードはトラッシュへ行きます。自分の召喚獣へのモンスター攻撃も同じ手札防御で守れます（回数は共通）。",
      "power 3 は攻撃後に場へ残った場合、次の自分ターン開始では回復しません。",
      "power 4 は攻撃後に場へ残った場合、力を使い切ってトラッシュへ行きます。蒼殻バリアはこの退場を 1 回防ぎます。",
    ],
  },
  {
    title: "術式と遺物",
    items: [
      "術式は条件を満たす時だけ発動できます。トラッシュへ送るカードや対象選択が必要な場合、人間プレイヤーは手動で選びます。",
    ],
  },
];

export function DiscardModal({ game, onClose, onSelect }: { game: GameState; onClose: () => void; onSelect: (index: number) => void }) {
  const owner = game.discardViewerOwner!;
  const player = game.players[owner];
  const selectedIndex = game.discardViewerIndex ?? (player.discard.length > 0 ? player.discard.length - 1 : null);
  const pending = game.pendingTarget?.kind === "card-select" && game.pendingTarget.zone === "discard" && game.pendingTarget.playerIndex === owner
    ? game.pendingTarget
    : null;
  const detailIndex = pending?.selectedIndexes[0] ?? selectedIndex;
  const selectedCard: Card | null = detailIndex === null ? null : player.discard[detailIndex] ?? null;
  return (
    <div className="modal-backdrop discard-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="discard-modal">
        <div className="modal-head">
          <h2>{player.name}のトラッシュ</h2>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        <div className="discard-view">
          <div className="discard-view-list">
            {player.discard.length === 0 ? <div className="discard-view-empty">トラッシュにカードはありません。</div> : [...player.discard].reverse().map((card, reverseIndex) => {
              const index = player.discard.length - 1 - reverseIndex;
              return (
                <CardView
                  key={`${card.id}-${index}`}
                  card={card}
                  ownerIndex={owner}
                  zone="discard"
                  index={index}
                  selected={pending ? pending.selectedIndexes.includes(index) : selectedIndex === index}
                  selectable={!pending || !pending.excludeIndexes.includes(index)}
                  showCost={false}
                  showSetBadge={false}
                  actionState={pending && pending.excludeIndexes.includes(index) ? "idle" : "usable"}
                  onClick={pending?.excludeIndexes.includes(index) ? undefined : () => onSelect(index)}
                />
              );
            })}
          </div>
          <div className="discard-view-detail">
            <SelectedCardDetail card={selectedCard} zone="discard" game={game} />
          </div>
        </div>
      </section>
    </div>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="rules-modal">
        <div className="modal-head">
          <h2>ルール</h2>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        <div className="rules-content">
          {RULE_SECTIONS.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
