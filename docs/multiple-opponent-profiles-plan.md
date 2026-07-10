# 複数相手プレイヤープロファイル 実装計画

- 作成日: 2026-07-10
- 状態: 実装・総合検証完了
- worktree: `/Users/user/WorkSpace/ai-break-duel-multiple-opponents`
- branch: `codex/multiple-opponent-profiles`
- base: `origin/develop` / `bc1e512`

## 0. 作業開始手順（worktree分離）

実装担当は、コードを編集する前に必ず専用worktreeを確認・準備する。元の `/Users/user/WorkSpace/ai-break-duel` や、別機能のworktreeでは実装しない。

使用する固定値:

- 元リポジトリ: `/Users/user/WorkSpace/ai-break-duel`
- 専用worktree: `/Users/user/WorkSpace/ai-break-duel-multiple-opponents`
- 専用branch: `codex/multiple-opponent-profiles`
- 基点branch: `origin/develop`

開始手順:

1. 元リポジトリで `git fetch --prune origin develop` を実行する。
2. `git worktree list --porcelain` で、専用pathとbranchの現在位置を確認する。
3. 専用worktreeが既に存在する場合:
   - 新しいworktreeを重ねて作らず、既存の `/Users/user/WorkSpace/ai-break-duel-multiple-opponents` をそのまま使う。
   - branchが `codex/multiple-opponent-profiles` であることを確認する。
4. 専用worktreeが存在しない場合:
   - branchも存在しなければ、`git worktree add -b codex/multiple-opponent-profiles /Users/user/WorkSpace/ai-break-duel-multiple-opponents origin/develop` で作成する。
   - branchだけ存在し、どのworktreeにも割り当てられていなければ、`git worktree add /Users/user/WorkSpace/ai-break-duel-multiple-opponents codex/multiple-opponent-profiles` で復元する。
   - branchが別worktreeに割り当て済みなら、削除や強制解除をせず、その実在pathを確認して同じbranchのworktreeを使う。
5. 以後の編集、テスト、コミットはすべて専用worktreeを `cwd` として行う。
6. `git status --short --branch` と `git rev-parse HEAD` を記録してからPhase 1へ進む。

安全条件:

- 元リポジトリや他worktreeの未追跡・未コミット変更を移動、削除、resetしない。
- 同名branchや同一pathが存在する時に、別名branchを勝手に増やさない。
- 実装中に `origin/develop` が進んでも、無関係な変更を途中で自動mergeしない。必要な同期は実装の安全な区切りで行い、競合を解消してから検証をやり直す。
- 現在は専用worktreeとbranchが作成済みなので、この計画を同じローカル環境で実行する担当は既存worktreeを再利用する。

## 1. 結論

> **2026-07-10 方針訂正:** 当初の「キャラクター素材はViteの静的カタログへコード登録し、画像・音声アップロードは対象外」という解釈は依頼意図と異なっていた。最終目標は、PC向け管理画面からキャラクターを追加し、複数イラスト、イベント別セリフ、音声をブラウザへ保存して対戦へ反映することとする。以下の旧記述と競合する場合は、この訂正を優先する。

訂正後の構成:

1. `/admin/characters` にキャラクター管理画面を追加する。
2. 表示名、安定ID、通常・被弾・喜び・切札・とどめの5画像を登録できる。
3. 15種類のゲームイベントごとに表示セリフと任意音声を登録できる。
4. 大容量Data URLは `localStorage` ではなくIndexedDBへ保存する。
5. 保存キャラクターを組み込みカタログへ実行時に合流し、対戦相手プロフィールの選択肢へ即時反映する。
6. 現リポジトリにはバックエンド・認証がないため、初期実装の管理データはブラウザ・オリジン単位とする。
7. 使用デッキとCPU難度もキャラクター定義へ含め、対戦準備は自分のデッキとキャラクターを選ぶだけにする。
8. 相手の編集・複製・削除、デッキ変更、難易度変更は対戦準備から除去し、キャラ管理へ一本化する。

今回の「複数」は、**複数の相手プレイヤープロファイルをブラウザへ保存し、1試合ごとに1人を選ぶ**機能として実装する。

対戦そのものは従来どおり1対1のままとする。ゲームエンジンは `players[0]` / `players[1]` と `1 - index` を前提にしているため、同時に3人以上が参加する対戦は別機能・別計画とする。

採用する設計は次の二層構造とする。

1. **キャラクター定義**
   - 画像、リアクション画像、カットイン画像、台詞、音声など、Vite がビルド時に取り込む静的素材。
   - コード内のカタログへ `characterId` 単位で登録する。
2. **保存相手プロフィール**
   - ユーザーが作成・編集・複製・削除する対戦相手設定。
   - プロフィール名、`characterId`、相手デッキ、CPU難度を `localStorage` に複数件保存する。

現在のニケは `nike` キャラクター定義へ移し、初回ロード時に「ニケ / ランダムデッキ / 挑戦者」の既定プロフィールを1件生成する。

## 2. 目的

- 相手プレイヤーを複数件、安定したIDで保存できる。
- 対戦準備画面で保存済みの相手を選択できる。
- 相手ごとにプロフィール名、キャラクター、デッキ、CPU難度を保持できる。
- 選んだキャラクターの表示名、立ち絵、リアクション、台詞、音声、カットインが1つの定義から一貫して解決される。
- 進行中の試合と、次戦向けに編集中のプロフィールを分離する。
- 現在のCPUロジック、デッキルール、勝敗処理、シミュレーション結果を変えない。

## 3. 非対象

- 3人以上が同時参加する対戦。
- 人間対人間、オンライン対戦、アカウント間同期。
- 画像・音声ファイルのアップロード。
- 画像・音声バイナリやData URLの `localStorage` 保存。
- CPU評価関数・難度バランスの変更。
- スマホ向けレイアウト、狭幅用media query。
- 2人目の本番キャラクター素材の制作。本計画では追加可能な基盤とテスト用定義までを扱い、本番素材は届いた時点で同じカタログへ登録する。

## 4. 現状調査

### 4.1 対戦設定

- `src/App.tsx:726-733`
  - 相手側は `opponentDeckSelection` と `opponentAiProfile` の単一stateだけ。
  - 相手プロフィールID、一覧、永続化は存在しない。
- `src/App.tsx:4021-4115`
  - 対戦準備は「自分のデッキ」「相手のデッキ」「相手CPU」の3設定。
  - 相手の作成、編集、複製、削除UIはない。
- `src/App.tsx:1638-1688`
  - 対戦開始時は相手デッキとCPU難度だけを `createGame` へ渡す。

### 4.2 ゲーム状態

- `src/game.ts:129-166`
  - `PlayerState` は試合中の可変状態であり、そのまま保存プロフィールにはできない。
  - 相手固有情報は実質 `name` と `aiProfile` だけ。
- `src/game.ts:970-1007`
  - `createGame` が相手名 `"ライバル"` を固定している。
  - 開始ログも `ライバル` 固定。
- `src/game.ts:1014-1020`
  - 相手取得は2席固定の `1 - active`。

### 4.3 キャラクター表現

- `src/App.tsx:131-134`、`src/App.tsx:3781-3790`
  - 通常、被弾、喜びの相手立ち絵を直接importし、固定で描画している。
- `src/App.tsx:868-950`
  - 台詞表示と音声再生が単一の `RIVAL_VOICE_LINES` を参照している。
- `src/App.tsx:4548-4581`
  - 吹き出し話者名が `ニケ` 固定。
- `src/rivalVoiceLines.ts:1-100`
  - 15種類の台詞とWAVがニケ1人分のsingletonになっている。
- `src/components/Overlays.tsx:5-12`、`src/components/Overlays.tsx:86-105`
  - 切札・とどめカットイン画像がコンポーネント内部の固定表。
- `src/duelEvents.ts:6-18`
  - カットインの意味だけでなく、ニケ固有の文言もルール寄りのイベント層にある。
- `src/App.tsx:1932-1963`、`src/App.tsx:3629-3648`
  - 勝敗タイトル、スコアにも `ライバル` 固定文言が残る。

### 4.4 永続化

- `src/components/DeckWorkshop.tsx:23-38`、`src/components/DeckWorkshop.tsx:576-609`
  - 保存デッキは `break-duel:saved-decks` に保存される。
- 相手設定用の保存キーはまだない。
- `src/collection.ts:18-50` には、`localStorage` が使えない環境でも動作を継続する既存パターンがある。

### 4.5 既に使える分離点

- CPU行動は `PlayerState.aiProfile` を参照しており、キャラクター画像・音声とは既に独立している。
- `src/game/actions.ts` は音声ファイルではなく `attack`、`command` などの意味IDをイベントへ載せている。
- 多くのログとイベント文言は `player.name` を使っているため、生成時の相手名を解決できれば自然に追従する。

## 5. データ設計

### 5.1 静的キャラクター定義

`src/opponents/` を新設し、素材と意味上の台詞をキャラクター単位へ集約する。

```ts
type OpponentVoiceCue =
  | "match_start"
  | "rival_turn_start"
  | "play_summon"
  | "upgrade"
  | "memory"
  | "charge"
  | "attack"
  | "field_defense"
  | "hand_defense"
  | "damage_taken"
  | "command"
  | "cutin_trump"
  | "cutin_finisher"
  | "victory"
  | "defeat";

type OpponentCharacterDefinition = Readonly<{
  id: string;
  defaultDisplayName: string;
  portraits: {
    default: string;
    hurt?: string;
    delight?: string;
    cutInTrump?: string;
    cutInFinisher?: string;
  };
  lines: Partial<Record<OpponentVoiceCue, {
    text: string;
    audioSrc?: string;
  }>>;
}>;
```

方針:

- `default` 立ち絵だけを必須とする。
- 被弾・喜び・カットイン画像がない場合は `default` へフォールバックする。
- 台詞cueがない場合は吹き出しも音声も出さない。
- 台詞はあり音声がない場合はテキストだけ表示する。
- 現在のニケは全15 cueと全画像を持つ完全な `nike` 定義へ移す。
- CPU難度はキャラクター素材の属性ではないため、キャラクター定義には持たせない。
- CSSの `rival` / `opponent` は人物名ではなく盤面上の役割なので維持する。

### 5.2 保存相手プロフィール

保存キーは `break-duel:opponent-profiles` とする。

```ts
type DeckSelection =
  | { kind: "random" }
  | { kind: "preset"; deckId: DeckId }
  | { kind: "saved"; deckId: string };

type SavedOpponentProfile = {
  id: string;
  profileLabel: string;
  characterId: string;
  deckSelection: DeckSelection;
  aiProfile: AiProfile;
  updatedAt: string;
};

type OpponentProfileStoreV1 = {
  version: 1;
  selectedProfileId: string;
  profiles: SavedOpponentProfile[];
};
```

保存ルール:

- IDは `crypto.randomUUID()` を優先し、利用不能時だけフォールバック生成する。
- `profileLabel` はtrim後に空でないこと、上限30文字を検証する。
- JSON shape不正、ID重複、未知のCPU難度、構造的に不正なデッキ選択は、そのプロフィールだけを破棄対象にする。
- 構造は正しいが `characterId` または保存デッキの参照先が見つからないプロフィールは破棄せず、「要修正」として保持する。アプリのダウングレードでも未知IDが発生しうるため、読み込みだけでデータを失わせない。
- 壊れた1件のために正常なプロフィールを破棄しない。
- `selectedProfileId` が構造的に有効なプロフィールを指していれば、参照先が「要修正」でも選択を維持する。対象レコード自体が破棄された場合だけ、先頭の構造的に有効なプロフィールへ復旧する。
- 構造的に有効なプロフィールが0件なら既定ニケプロフィールを生成する。
- store envelopeの `version` ごとに明示的なmigration関数を置く。アプリが知らない将来versionは自動保存・上書きせず、raw値を保持したまま「このバージョンでは読み込めない」と通知する。そのセッションは既定プロフィールで対戦できるが、明示的な初期化を行わない限り永続データへ書き戻さない。
- 保存デッキ参照が削除・無効化された場合は勝手にランダムへ変えず、「要修正」と表示して対戦開始を止める。
- 参照整合性はstorageの構造解析と分け、対戦準備を開いた時、保存デッキ一覧を再読込した時、対戦開始直前に最新のキャラクターカタログと `SavedDeck[]` で再評価する。
- 画像URL、音声URL、台詞本文は保存せず、`characterId` だけを保存する。
- 保存プロフィール名と対戦中のキャラクター名を分ける。`profileLabel` は「ニケ・火デッキ」のような保存設定の識別名、対戦中の名前は変更不可の `character.defaultDisplayName` とする。これにより画面名と「ニケがお相手します」という既存音声が矛盾しない。
- 既定プロフィールは `createDefaultNikeProfile()` だけで生成する。`profileLabel` は「ニケ（標準）」、デッキ `random`、CPU `challenger` とし、対戦中の表示名は `nike.defaultDisplayName` から解決する。
- save処理は `persisted` / `session-only` / `unsupported-version` を呼び出し側へ返す。`localStorage` 書込失敗時もReact stateとメモリフォールバックでCRUD・選択をセッション中は維持し、「このタブでは使えますがブラウザへ保存できません」と表示する。

### 5.3 解決済みスナップショット

次戦向けの保存プロフィールと、進行中の相手表示を同じ参照にしない。

```ts
type ResolvedOpponentSnapshot = {
  profileId: string;
  profileLabel: string;
  displayName: string;
  characterId: string;
  aiProfile: AiProfile;
  character: OpponentCharacterDefinition;
  matchId: string;
};
```

対戦開始時に選択プロフィールをスナップショット化し、その試合中は編集・削除の影響を受けないようにする。デッキ選択はsnapshotへ残さず、開始時に `DuelDeckSource` へ解決して生成済み `GameState.players[1].deckName` を正本にする。これにより、保存デッキの編集・削除が進行中試合へ逆流しない。

stateとrefは必ず1つの関数で同時更新する。

```ts
function activateOpponent(next: ResolvedOpponentSnapshot) {
  activeOpponentRef.current = next;
  setActiveOpponent(next);
}
```

## 6. ゲーム生成API

`createGame` に位置引数を追加し続けず、ブラウザ用に設定オブジェクト境界を追加する。

```ts
type DuelPlayerSetup = {
  name: string;
  deck: DeckId | DuelDeckSource;
  isHuman: boolean;
  aiProfile: AiProfile;
};

type DuelSetup = {
  first: DuelPlayerSetup;
  second: DuelPlayerSetup;
};

createGameFromSetup(seed, setup);
```

- ブラウザは `createGameFromSetup` を使い、解決済みの相手名、デッキ、CPU難度を渡す。
- 既存の `createGame(seed, playerDeck, opponentDeck, opponentAiProfile)` は互換ラッパーとして残し、シミュレーションと既存テストを一度に壊さない。
- 乱数列を維持するため、内部は `createGameCore(seed, rng, setup)` とする。旧APIは現行と同じ順序で「相手ランダムデッキ選択 → 1Pシャッフル → 2Pシャッフル」に1つのRNGを使い、消費途中の同じRNGをcoreへ渡す。wrapperとcoreでRNGを作り直さない。
- キャラクター画像・音声はゲームエンジンへ入れない。ルール層が必要とするのは名前、デッキ、CPU難度だけ。
- `PlayerState` を保存形式にはせず、保存プロフィールから毎試合新しい `PlayerState` を生成する。

## 7. UI設計

新しい管理ページは増やさず、既存の「対戦準備」へ統合する。

### 7.1 対戦準備

- 上部サマリーを次の4項目にする。
  1. あなたのデッキ
  2. 対戦相手
  3. 相手デッキ
  4. CPU難度
- メイン領域はPC向け2列を維持する。
  - 左: 自分のデッキ選択
  - 右: 保存済み相手プロフィール一覧
- 相手カードに次を表示する。
  - 立ち絵サムネイル
  - プロフィール名
  - キャラクター表示名
  - デッキ名
  - CPU難度
  - 選択状態

### 7.2 プロフィール操作

- `新しい相手`
- `編集`
- `複製`
- `削除`

編集項目:

- プロフィール名
- キャラクター
- 相手デッキ
- CPU難度

挙動:

- 編集はPC向けダイアログで行う。プロフィール名・キャラクター・CPUを上部、デッキ一覧を中央のスクロール領域、保存・キャンセルを固定フッターへ置く。
- production catalogのキャラクターが1件だけの間は、キャラクター選択を読み取り専用表示にする。2件以上登録された時だけ選択UIを表示する。
- 編集はdraftで行い、`保存` まで永続データを変更しない。
- `キャンセル` は変更を破棄する。
- dirtyな編集画面を閉じる、別プロフィールへ移る、対戦準備自体を閉じる場合は、編集中の変更を破棄する確認を表示する。
- 保存結果が `session-only` の場合は成功扱いの文言にせず、永続化できていないことを明示する。
- 新規プロフィールの保存後は、その新規プロフィールを選択する。
- 複製時は新しいIDを発行し、30文字内へ切り詰めた「コピー」付きプロフィール名を作り、複製先を選択する。
- 非選択プロフィールを削除しても現在の選択は維持する。選択中プロフィールを削除した場合は、一覧上の次のプロフィール、なければ直前のプロフィールを選択する。
- 削除前は対象名を含む確認を表示する。
- 最後の1件は削除できない。
- 参照先デッキまたはキャラクターが無効なプロフィールは、具体的な理由と `編集して修正` 導線を付けた「要修正」とし、選択できても対戦開始は無効化する。
- 狭幅向けの別UIやmedia queryは追加しない。

| 操作 | 保存後の選択 | 進行中snapshot |
| --- | --- | --- |
| 新規保存 | 新規プロフィール | 変更しない |
| 編集保存 | 編集対象を維持 | 変更しない |
| 複製 | 複製先 | 変更しない |
| 非選択プロフィール削除 | 現在選択を維持 | 変更しない |
| 選択中プロフィール削除 | 次、なければ直前 | 変更しない |
| 対戦開始 | 選択プロフィール | 新snapshotへ置換 |

## 8. 表示・音声・カットインの一般化

### 8.1 音声cue

- cue型をニケのデータファイルから人物非依存の `OpponentVoiceCue` へ移し、既存の文字列値は維持する。
- `DuelEventPayload.rivalVoiceLine`、`rivalSpeech`、`showRivalVoiceLine` などの `rival` は2P席の役割名として今回維持する。広範な命名整理は機能差分へ混ぜない。
- `src/game/actions.ts` はこれまでどおり意味cueだけを発行する。
- `App.tsx` が進行中の `ResolvedOpponentSnapshot.character.lines` からテキストと音声を解決する。

### 8.2 非同期競合の防止

対戦開始は次の順序を持つ1つのトランザクションにする。

1. `resetDuelEvents` で旧queue、timer、Audio、pending cueを停止する。
2. `activateOpponent(nextSnapshot)` で新snapshotのrefとstateを同時更新する。
3. `gameResolvedRef.current = false` と、新しい `matchId` / `profileId` を含むvoice state keyを同期更新する。
4. 新しい `GameState` と画面stateを設定する。
5. 新snapshotを明示的に渡して `match_start` cueを再生する。

speech timer、Audioの `ended`、pending cueを含む全コールバックは生成時の `matchId` を保持し、現在のmatch tokenと一致する場合だけ続行する。古いコールバックから現在プロフィールのcueを再解決しない。

### 8.3 立ち絵と吹き出し

- `LeaderPortrait` へ解決済み画像と話者名を渡す。
- 吹き出しの固定 `ニケ` を `snapshot.displayName` へ置き換える。
- 被弾・喜び画像がなければ通常立ち絵へフォールバックする。

### 8.4 カットイン

- `DuelCutIn` は `trump` / `finisher` という意味情報だけを持つ。
- ニケ固有の画像・台詞・音声を `duelEvents.ts` と `Overlays.tsx` から除く。
- `DuelCutInView` は選択中キャラクターの画像とcueをpropsで受け取る。
- カットイン画像がなければ通常立ち絵、音声がなければテキストのみ、cue自体がなければ画像演出のみとする。

## 9. チュートリアルとDEV機能

- チュートリアルは最後に選んだ相手プロフィールへ追従させない。
- 永続storeに依存しない静的なチュートリアル用ニケsnapshotを生成し、`createTutorialGame` の `players[1].name` も `ニケ` に揃える。盤面・ログ・吹き出しで「ライバル」と「ニケ」が混在する状態を残さない。
- 通常対戦と同じ `activateOpponent` と開始トランザクションを通し、snapshot ref設定後に開始cueを再生する。
- チュートリアルの固定手札、固定デッキ、行動順、勝敗条件は変更しない。
- DEVの「ライバル」は盤面上の役割名として維持する。
- カットインプレビューは現在進行中の相手キャラクターで表示し、キャラクター別確認ができるようにする。

## 10. 実装ファイル

### 新規

- `src/savedDecks.ts`
  - `SavedDeck`、load/save、デッキ検証を `DeckWorkshop.tsx` から抽出し、UI以外から安全に参照できるようにする。
- `src/duelSetup.ts`
  - `DeckSelection`、キャラクター/プリセット/保存デッキ参照の解決、ラベル、現在の合法性判定。
- `src/opponents/types.ts`
  - キャラクター定義、音声cue、保存プロフィール、store、snapshot型。
- `src/opponents/nike.ts`
  - 現在のニケ画像、台詞、音声を1つの定義へ集約。
- `src/opponents/catalog.ts`
  - キャラクターカタログ、ID解決、画像・音声フォールバック。
- `src/opponents/storage.ts`
  - versioned load/save、CRUD、migration、JSON構造・ID検証、既定データ生成。キャラクターや保存デッキの存在確認には依存しない。
- `src/opponents/catalog.test.ts`
  - production catalogとは別に、画像URL・台詞・音声srcが明確に異なる `test-opponent-a` / `test-opponent-b` をテスト内で注入する。
- `src/opponents/storage.test.ts`
- `src/components/DuelSetupPanel.tsx`
  - `App.tsx` 内の対戦準備UIを移し、相手一覧・編集UIを担当。

### 主な変更

- `src/App.tsx`
  - 単一相手stateをprofile store + active snapshotへ変更。
  - 立ち絵、台詞、音声、結果文言をsnapshot解決へ変更。
- `src/game.ts`
  - `createGameFromSetup` を追加し、固定相手名を除去。
  - 既存 `createGame` は互換ラッパーとして維持。
- `src/game/actions.ts`
  - cue型のimport先だけを人物非依存モジュールへ変更し、既存event fieldと文字列値は維持。
- `src/duelEvents.ts`
  - ニケ固有のカットイン文言を除去。
- `src/components/Overlays.tsx`
  - 固定カットイン画像importを除去し、props化。
- `src/components/DuelPanel.tsx`
  - 必要な固定 `ライバル` 文言を実際の相手名へ変更。
- `src/components/DeckWorkshop.tsx`
  - 保存デッキの型・永続化・検証を `src/savedDecks.ts` から利用する。
- `src/styles.css`
  - PC向け相手プロフィールカードと編集UIのみ追加。
- `src/tutorial.ts`
  - チュートリアル相手名をニケへ揃え、固定進行は維持。
- `README.md`
- `docs/game-spec.md`
- `docs/architecture.md`
- `LICENSE-ASSETS.md`
  - 新規相手素材の包括的な配置・権利対象を追記。

現在のバイナリアセットは初回実装で移動せず、`nike.ts` から既存パスを参照する。新しい相手素材は `src/assets/opponents/<characterId>/` を標準配置先とする。

## 11. 実装順序

### Phase 1: ニケsingletonのキャラクター定義化

- [x] `OpponentVoiceCue` と `OpponentCharacterDefinition` を追加する。
- [x] 現在のニケ画像・台詞・音声を `nike` 定義へ移す。
- [x] App/Overlayが `nike` 定義を参照する状態へ切り替える。
- [x] この時点では対戦準備UIを変えず、現行演出を維持する。

### Phase 2: 進行中snapshotと演出境界

- [x] `activateOpponent` でactive snapshotのstate/refを一元更新する。
- [x] 名前、通常立ち絵、リアクション、吹き出しをsnapshotから描画する。
- [x] 音声cueをsnapshotのキャラクター定義から解決する。
- [x] カットイン画像・台詞・音声をsnapshotから解決する。
- [x] 開始トランザクションとmatch token検証を実装する。
- [x] Vitest fake timersと偽Audio adapterで、旧timer/`ended`/pending cueが次試合へ混ざらないことをテストする。

### Phase 3: 保存モデルと参照検証

- [x] 保存デッキの型・load/save/validationを `src/savedDecks.ts` へ抽出する。
- [x] `DeckSelection` を `App.tsx` から `duelSetup.ts` へ移す。
- [x] `OpponentProfileStoreV1` と既定ニケプロフィールを追加する。
- [x] load/save/migration/構造validationを追加する。
- [x] `duelSetup.ts` にキャラクター・preset・保存デッキの参照整合性検証を追加する。
- [x] 作成・編集・複製・削除の純粋関数を追加する。
- [x] 壊れたJSON、不明versionの非破壊動作、重複ID、未解決参照、0件復旧をテストする。
- [x] 永続化失敗時のsession-only状態と通知契約をテストする。

### Phase 4: ゲーム生成境界

- [x] 同一RNGを受け取る `createGameCore` と `createGameFromSetup` を追加する。
- [x] ブラウザ開始処理から解決済み相手名・デッキ・CPUを渡す。
- [x] 既存 `createGame` の乱数消費順とシミュレーション互換を維持する。
- [x] 開始ログと勝敗表示が実際のキャラクター名を使うようにする。

### Phase 5: 保存プロフィールUIとチュートリアル統合

- [x] 対戦準備を `DuelSetupPanel` へ抽出する。
- [x] 保存済み相手一覧と選択UIを追加する。
- [x] PC向け編集ダイアログへ新規・編集・複製・削除を追加する。
- [x] CRUD後の選択規則、dirty破棄確認、削除確認を実装する。
- [x] 無効参照の具体的理由と `編集して修正` 導線を表示する。
- [x] 最後の1件削除を防ぐ。
- [x] 選択プロフィールをreload後も復元する。
- [x] チュートリアルのゲーム名・active snapshot・開始cueを静的ニケ定義へ揃える。

### Phase 6: 仕様・ライセンス・総合検証

- [x] READMEへ複数相手プロフィールの保存・選択を追記する。
- [x] `docs/game-spec.md` へプロフィール、既定値、保存、無効参照時の挙動を追記する。
- [x] `docs/architecture.md` へカタログ・storage・active snapshot境界を追記する。
- [x] `LICENSE-ASSETS.md` へ相手別素材の包括規約を追記する。
- [x] `npm run check` を通す。
- [x] ブラウザ実機確認を完了する。
- [x] UI崩れ報告後、`1247 x 646` の対戦準備と `1171 x 912` の編集ダイアログを再確認して修正する。
- [x] 修正後にプロフィール新規作成・デッキ選択・保存をブラウザで再確認する。
- [x] 依頼意図を管理画面からのキャラクター素材登録へ訂正する。
- [x] IndexedDBへキャラクター、複数イラスト、イベント別セリフ・音声を保存する。
- [x] `/admin/characters` の追加・編集・削除UIを実装する。
- [x] 保存キャラクターを対戦準備と進行中snapshotへ接続する。
- [x] PCブラウザで5画像・セリフ・WAV音声の登録、reload復元、対戦反映を確認する。
- [x] 使用デッキとCPU難度をキャラクター管理へ追加する。
- [x] 対戦準備から相手プロフィールCRUDと相手設定編集を除去する。
- [x] キャラクター選択だけで登録済みデッキ・CPU難度が実戦へ適用されることを確認する。
- [x] 組み込みキャラクター詳細のメイン画像を正方形表示にする。
- [x] 既存素材の実寸から、画像アップロード欄へ推奨アスペクト比を表示する。
- [x] 実装結果を `docs/multiple-opponent-profiles-results.md` に残す。

## 12. テスト計画

### 12.1 カタログ

- キャラクターIDが重複しない。
- 既定 `nike` が必ず存在する。
- 通常立ち絵と既定名が存在する。
- optional画像と音声が正しくフォールバックする。
- ニケの全15 cueが移行前と同じテキスト・音声を参照する。

### 12.2 保存

- 複数プロフィールを保存・再読込できる。
- `selectedProfileId` がreload後も維持される。
- 作成、編集、複製、削除が他プロフィールを壊さない。
- 新規・複製後は対象を選択し、選択中削除後は次、なければ直前を選択する。
- dirty編集の破棄確認と削除確認が意図せず保存データを変えない。
- 最後の1件を削除できない。
- 壊れたJSON、未知version、重複ID、不正フィールドから安全に復旧する。
- 未知versionを読み込んでも元のraw値を上書きしない。
- `localStorage` が利用不能でも既定プロフィールで対戦できる。
- `localStorage` 書込不能時もセッション中のCRUD・選択状態が維持され、session-only結果が返る。
- 削除済み保存デッキ参照を「要修正」と判定する。
- 対戦準備open時・保存デッキ再読込時・開始直前に参照整合性を再評価する。

### 12.3 ゲーム生成

- 任意の相手名、デッキ、`aiProfile` が `players[1]` へ入る。
- 開始ログが固定 `ライバル` ではなく実際の相手名を使う。
- 相手省略、相手明示、`beginner` / `challenger`、複数seedについて、移行前後の両者の山札順・初期手札・ログ・初期手番状態が完全一致する。
- 互換 `createGame` の乱数消費順とシミュレーション結果が変わらない。
- チュートリアルの `players[1].name`、`aiProfile`、固定デッキ、active snapshotがすべて静的ニケ定義と整合する。

### 12.4 表示

- `LeaderPortrait` が渡された相手名と画像を表示する。
- 被弾・喜び画像の有無で正しいフォールバックを使う。
- `DuelCutInView` が渡されたキャラクター画像・台詞を表示する。
- cueなし、音声なしでも例外を出さない。
- productionへ2人目の仮素材を混ぜず、テスト内で注入するA/Bキャラクター定義により、立ち絵・台詞・音声src・カットイン解決が混線しないことを検証する。
- Vitest fake timersと偽Audio生成器で、古いspeech timer、Audio `ended`、pending cueが新しいmatch tokenでは無視されることを検証する。
- `DuelSetupPanel` の静的renderで、選択中、要修正理由、最後の1件削除不可、保存ボタン状態を検証する。
- editorの純粋なstate遷移で、保存、キャンセル、新規/複製後の選択、選択中削除、dirty破棄確認を検証する。
- 対戦開始toast/banner、上部名、ターンbanner、勝敗タイトル/スコア、操作ヒント、吹き出し、開始ログ、イベントタイトルが実際のキャラクター名へ追従する。

### 12.5 ブラウザ確認

1. ニケキャラクターを参照する相手A/Bを別プロフィール名・別デッキ・別CPUで保存し、選択した設定で対戦開始する。
2. 対戦準備で選択だけ変えて閉じても、進行中の相手が変わらないことを確認する。
3. 進行中プロフィールと同じ保存レコードを編集・削除しても、その試合の名前・立ち絵・音声snapshotが変わらないことを確認する。
4. reload後も複数プロフィールと選択中IDが復元されることを確認する。
5. 参照先の保存デッキを削除すると「要修正」になり、対戦開始できないことを確認する。
6. チュートリアルが選択中プロフィールに影響されず、既定ニケで進行することを確認する。
7. 初回セットアップを対戦開始せず閉じても、初期ゲームと既定ニケsnapshotが一致することを確認する。

2人の異なるキャラクター素材を使ったブラウザ確認は、2人目の本番 `OpponentCharacterDefinition` 登録時の追加受入項目とする。それまでは、A/Bの画像・台詞・音声src・カットイン混線をテスト用注入カタログで自動検証する。

CPU評価・カードルールを変更しないため、バランスリーグの再計測は不要とする。

## 13. 完了条件

- 2件以上の相手プロフィールを保存、選択、編集、複製、削除できる。
- profile storeがversion付きで永続化され、reload後も復元される。
- 進行中の相手が次戦向け編集の影響を受けない。
- 相手固有の名前・画像・台詞・音声・カットインが単一のキャラクター定義から解決される。
- `App.tsx`、`Overlays.tsx`、`duelEvents.ts` からニケ固有のsingleton参照が除かれる。
- 現在のニケ素材・台詞・音声が既定キャラクターとして維持される。
- 通常対戦、チュートリアル、DEVカットイン確認が動作する。
- `npm run check` が成功する。
- PCブラウザで上記ブラウザ確認が完了する。
- `docs/multiple-opponent-profiles-results.md` に実装結果と残課題が記録される。

## 14. 主なリスクと対策

| リスク | 対策 |
| --- | --- |
| 設定画面で選択しただけで進行中の相手が変わる | selected/draftとactive snapshotを分離する |
| React state反映前に旧相手の開始音声が鳴る | snapshot refを同期更新してから音声を開始する |
| 前試合の遅延音声が次試合へ混ざる | reset後に開始し、queue keyへmatch/profile IDを含める |
| object API移行で同じseedの山札順が変わる | 1つのRNGと既存の消費順をcore/wrapper間で維持し、完全一致テストを置く |
| 削除済み保存デッキを黙って別デッキへ変える | 「要修正」と表示し、開始を止める |
| 画像・音声をlocalStorageへ入れて容量超過する | 保存するのはcharacterIdだけにする |
| 新キャラクターに全素材が揃わず登録できない | 通常立ち絵だけ必須、他は明示的にフォールバックする |
| 変更がシミュレーションへ波及する | ブラウザ用object APIを追加し、旧createGameを互換維持する |
| チュートリアルが別キャラクターの声になる | 既定ニケsnapshotへ固定する |

## 15. 実装開始時の最初の作業

最初のコミット単位は **Phase 1の「現行ニケをキャラクター定義へ移すが、画面挙動は変えない」** とする。ここでキャラクター表現の参照点を1つにした後、保存モデルとUIを段階的に載せる。
