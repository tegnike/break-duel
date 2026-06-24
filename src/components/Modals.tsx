import { type Card, type GameState } from "../game";
import { CardView } from "./CardView";
import { SelectedCardDetail } from "./DuelPanel";

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
          <section><h3>目的</h3><p>相手のライフを 0 にすると勝利。各プレイヤーの場には召喚獣を最大 3 体まで出せます。</p></section>
          <section><h3>ターン</h3><p>通常は 2 アクションです。1ターンに1回、手札1枚をチャージしてトラッシュし、アクションを1増やせます。チャージしたターンは攻撃できません。先攻の最初のターンだけ 1 アクション、ドローなし、攻撃不可です。</p></section>
          <section><h3>カード</h3><ul><li>召喚獣: 場に出して攻撃・防御します。</li><li>指令: 1回使うとトラッシュへ行きます。</li><li>遺物: 1枚だけ置ける継続枠です。</li></ul></section>
          <section><h3>攻撃と防御</h3><p>攻撃した召喚獣は消耗します。場の召喚獣で防御した場合、防御値と攻撃値が同じなら相打ち、上回れば攻撃側だけトラッシュへ行きます。</p></section>
          <section><h3>手札防御</h3><p>1ターンに1回まで、場の状態に関係なく条件を満たす手札の召喚獣で攻撃を止められます。手札の防御カードはトラッシュへ行きます。</p></section>
          <section><h3>属性と個別効果</h3><p>属性相性はありません。効果は一部の召喚獣だけが個別に持ちます。火は攻撃と退場時の補充、水はドローと手札調整、風はテンポ、土は防御と手札が薄い時の回収が得意です。</p></section>
        </div>
      </section>
    </div>
  );
}
