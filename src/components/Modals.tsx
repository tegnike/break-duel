import { type Card, type GameState } from "../game";
import { CardView } from "./CardView";
import { SelectedCardDetail } from "./DuelPanel";

const RULE_SECTIONS = [
  {
    title: "目的と勝敗",
    items: [
      "相手のライフを 0 にすると勝利。",
      "山札・手札・場の召喚獣がすべて空になったプレイヤーは敗北。両者同時なら引き分け。",
      "60 手番で決着しない場合は残りライフが多い側の判定勝ち。同点なら引き分け。",
    ],
  },
  {
    title: "初期設定",
    items: [
      "各プレイヤーは 20 枚デッキ、初期ライフは 5。",
      "先攻は手札 5 枚、後攻は手札 4 枚。",
      "保存デッキは 20 枚ちょうど、同名 2 枚まで、power 3 以上の召喚獣は合計 4 枚まで。",
    ],
  },
  {
    title: "カード種別",
    items: [
      "召喚獣: 場に最大 3 体まで出して攻撃・防御します。",
      "指令: 1 アクションで使い、解決後にトラッシュへ行きます。",
      "遺物: 1 アクションで 1 枚だけ配置できる継続枠です。置き換えた古い遺物はトラッシュへ行きます。",
    ],
  },
  {
    title: "ターンとドロー",
    items: [
      "通常はターン開始時に 1 枚引き、2 アクションで行動します。",
      "先攻の最初のターンだけ 1 アクション、ドローなし、攻撃不可です。",
      "山札が空ならドローは 0 枚。トラッシュは自動で山札に戻りません。",
      "手札上限はありません。ターン終了時の自動手札破棄はありません。",
    ],
  },
  {
    title: "登場とアップグレード",
    items: [
      "召喚獣の通常登場コストは power 1/2 が 1 アクション、power 3/4 が 2 アクション。",
      "同属性かつ低 power の場の召喚獣を元にアップグレードできます。元カードはトラッシュへ行きます。",
      "アップグレードコストは通常登場コスト -1、最低 1 アクション。場が埋まっていても入れ替えで実行できます。",
      "登場した召喚獣は未消耗です。攻撃可能条件を満たせば、そのターンに攻撃できます。",
    ],
  },
  {
    title: "チャージ",
    items: [
      "1 ターンに 1 回、手札 1 枚をチャージしてトラッシュできます。チャージ自体はアクションを消費しません。",
      "チャージできるカードは power 1/2 の召喚獣、指令、遺物です。power 3/4 の召喚獣はチャージできません。",
      "チャージすると残りアクション +1、上限は 3。残りアクション 0 でも条件を満たせばチャージできます。",
      "チャージしたターンは攻撃できません。チャージ時効果と蓄光の祭壇はチャージ後に処理します。",
    ],
  },
  {
    title: "攻撃",
    items: [
      "未消耗の自分の召喚獣 1 体で攻撃します。攻撃した召喚獣は消耗します。",
      "攻撃値は召喚獣の power + 個別効果です。防御されなければ相手に 1 ダメージ。",
      "power 3 は攻撃後に場へ残った場合、次の自分ターン開始では未消耗に戻りません。",
      "power 4 は攻撃後に場へ残った場合、力を使い切ってトラッシュへ行きます。蒼殻バリアはこの退場を 1 回防ぎます。",
    ],
  },
  {
    title: "防御",
    items: [
      "防御値は召喚獣の power + 個別効果 + 防御時ボーナスです。防御値が攻撃値以上なら防御できます。",
      "場防御は同値なら相打ちで両方トラッシュ。上回れば攻撃側だけトラッシュ、防御側は場に残って消耗します。",
      "手札防御は 1 ターンに 1 回まで、場の状態に関係なく使えます。防御カードはトラッシュへ行き、攻撃側は場に残ります。",
      "消耗中の召喚獣は攻撃も防御もできません。",
    ],
  },
  {
    title: "指令と遺物効果",
    items: [
      "指令は条件を満たす時だけ使えます。捨て札や対象選択が必要な場合、人間プレイヤーは手動で選びます。",
      "刻火の加速炉は 1 ターンに 1 回、場の召喚獣 1 体をトラッシュして残りアクション +1 できます。この追加アクションでは攻撃できます。",
      "星泉の導脈、灯火の旅嚢、蓄光の祭壇などは条件を満たした時だけドローします。",
    ],
  },
  {
    title: "属性と個別効果",
    items: [
      "属性相性はありません。どの属性でも防御候補になれます。",
      "火は攻撃と手札・ライフ圧、水はドローと手札調整、風は消耗操作と再行動、土は防御と回収が得意です。",
      "一部の召喚獣だけが個別効果を持ちます。詳細はカード詳細とカード一覧で確認できます。",
    ],
  },
];

export function DiscardModal({ game, onClose, onSelect }: { game: GameState; onClose: () => void; onSelect: (index: number) => void }) {
  const owner = game.discardViewerOwner!;
  const player = game.players[owner];
  const selectedIndex = game.discardViewerIndex ?? (player.discard.length > 0 ? player.discard.length - 1 : null);
  const selectedCard: Card | null = selectedIndex === null ? null : player.discard[selectedIndex] ?? null;
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
                  selected={selectedIndex === index}
                  selectable
                  showCost={false}
                  actionState="usable"
                  onClick={() => onSelect(index)}
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
