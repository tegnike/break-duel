import { BATTLE_DECK_IDS, DECKS } from "../game";
import {
  deckSelectionLabel,
  isDeckSelectionEqual,
  validateOpponentProfileReferences,
  type DeckSelection,
} from "../duelSetup";
import {
  listOpponentCharacters,
  opponentAiProfile,
  opponentDeckSelection,
  opponentPortrait,
  resolveOpponentCharacter,
} from "../opponents/catalog";
import {
  createOpponentProfile,
  selectOpponentProfile,
  updateOpponentProfile,
  type OpponentStoreSaveResult,
} from "../opponents/storage";
import type { OpponentCharacterDefinition, OpponentProfileStoreV1 } from "../opponents/types";
import { validateDeck, type SavedDeck } from "../savedDecks";

export function DuelSetupPanel({
  playerSelection,
  savedDecks,
  opponentStore,
  persistence,
  onClose,
  onStartTutorial,
  onChangePlayerSelection,
  onChangeOpponentStore,
  onInitializeStorage,
  onStart,
}: {
  playerSelection: DeckSelection;
  savedDecks: SavedDeck[];
  opponentStore: OpponentProfileStoreV1;
  persistence: OpponentStoreSaveResult;
  onClose: () => void;
  onStartTutorial: () => void;
  onChangePlayerSelection: (selection: DeckSelection) => void;
  onChangeOpponentStore: (store: OpponentProfileStoreV1, message?: string) => void;
  onInitializeStorage: () => void;
  onStart: () => void;
}) {
  const characters = listOpponentCharacters();
  const selectedProfile = opponentStore.profiles.find((profile) => profile.id === opponentStore.selectedProfileId) ?? opponentStore.profiles[0];
  const selectedCharacter = selectedProfile
    ? resolveOpponentCharacter(selectedProfile.characterId)
    : characters[0] ?? null;
  const selectedDeck = selectedCharacter ? opponentDeckSelection(selectedCharacter) : { kind: "random" as const };
  const selectedAi = selectedCharacter ? opponentAiProfile(selectedCharacter) : "challenger";
  const effectiveProfile = selectedProfile && selectedCharacter ? {
    ...selectedProfile,
    profileLabel: selectedCharacter.defaultDisplayName,
    characterId: selectedCharacter.id,
    deckSelection: selectedDeck,
    aiProfile: selectedAi,
  } : null;
  const selectedReference = effectiveProfile
    ? validateOpponentProfileReferences(effectiveProfile, savedDecks)
    : { valid: false as const, reason: selectedProfile ? `キャラクター「${selectedProfile.characterId}」が見つかりません` : "対戦キャラクターがありません" };

  function chooseCharacter(character: OpponentCharacterDefinition) {
    const deckSelection = opponentDeckSelection(character);
    const aiProfile = opponentAiProfile(character);
    const existing = opponentStore.profiles.find((profile) => profile.characterId === character.id);
    if (existing) {
      const updated = updateOpponentProfile(opponentStore, existing.id, {
        profileLabel: character.defaultDisplayName,
        characterId: character.id,
        deckSelection,
        aiProfile,
      });
      onChangeOpponentStore(selectOpponentProfile(updated, existing.id));
      return;
    }
    onChangeOpponentStore(createOpponentProfile(opponentStore, {
      profileLabel: character.defaultDisplayName,
      characterId: character.id,
      deckSelection,
      aiProfile,
    }));
  }

  return (
    <section className="starter-deck-modal starter-setup-panel opponent-setup-panel" aria-labelledby="starter-deck-title">
      <div className="modal-head opponent-setup-head">
        <div>
          <span className="modal-kicker">DUEL SETUP</span>
          <h2 id="starter-deck-title">対戦準備</h2>
          <p>自分のデッキと対戦キャラクターを選んで、1対1の試合を開始します。</p>
        </div>
        <button type="button" onClick={onClose}>閉じる</button>
      </div>

      {persistence !== "persisted" && (
        <div className="opponent-storage-warning" role="status">
          選択中の対戦キャラクターをブラウザへ保存できません。このタブでは引き続き対戦できます。
          {persistence === "unsupported-version" && <button type="button" onClick={onInitializeStorage}>選択データを初期化</button>}
        </div>
      )}

      <div className="starter-setup-summary opponent-setup-summary" aria-label="現在の対戦設定">
        <div><span>あなたのデッキ</span><strong>{deckSelectionLabel(playerSelection, savedDecks)}</strong></div>
        <div><span>対戦キャラクター</span><strong>{selectedCharacter?.defaultDisplayName ?? "未選択"}</strong></div>
        <div><span>キャラクターのデッキ</span><strong>{selectedCharacter ? deckSelectionLabel(selectedDeck, savedDecks) : "-"}</strong></div>
        <div><span>CPU難度</span><strong>{selectedAi === "beginner" ? "初心者" : "挑戦者"}</strong></div>
      </div>

      <div className="starter-duel-selectors opponent-profile-layout opponent-setup-main">
        <DeckSelectionPicker
          title="自分のデッキ"
          step="1"
          selection={playerSelection}
          savedDecks={savedDecks}
          onChange={onChangePlayerSelection}
        />
        <section className="starter-deck-picker opponent-profile-picker" aria-label="対戦キャラクター">
          <div className="starter-picker-title opponent-picker-heading">
            <div><span>2</span><h3>対戦キャラクター</h3></div>
            <small>編集は「キャラ管理」から</small>
          </div>
          <div className="opponent-profile-list">
            {characters.map((character) => {
              const deckSelection = opponentDeckSelection(character);
              const aiProfile = opponentAiProfile(character);
              const reference = validateOpponentProfileReferences({
                id: `character-${character.id}`,
                profileLabel: character.defaultDisplayName,
                characterId: character.id,
                deckSelection,
                aiProfile,
                updatedAt: "",
              }, savedDecks);
              const selected = character.id === selectedCharacter?.id;
              return (
                <article className={`opponent-profile-card character-choice-card ${selected ? "selected" : ""} ${reference.valid ? "" : "needs-repair"}`} key={character.id}>
                  <button type="button" className="opponent-profile-select" aria-pressed={selected} onClick={() => chooseCharacter(character)}>
                    <img src={opponentPortrait(character, "default")} alt="" />
                    <span>
                      <strong>{character.defaultDisplayName}</strong>
                      <em>{deckSelectionLabel(deckSelection, savedDecks)}</em>
                      <small>CPU: {aiProfile === "beginner" ? "初心者" : "挑戦者"}</small>
                    </span>
                  </button>
                  {!reference.valid && <p className="opponent-profile-error">要修正: {reference.reason}</p>}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="starter-modal-actions opponent-setup-actions">
        <button type="button" onClick={onStartTutorial}>まずはチュートリアル</button>
        <button type="button" className="primary-action" disabled={!selectedReference.valid} title={selectedReference.valid ? "" : selectedReference.reason} onClick={onStart}>
          この設定で対戦開始
        </button>
      </div>
    </section>
  );
}

function DeckSelectionPicker({ title, step, selection, savedDecks, onChange }: {
  title: string;
  step: string;
  selection: DeckSelection;
  savedDecks: SavedDeck[];
  onChange: (selection: DeckSelection) => void;
}) {
  return (
    <section className="starter-deck-picker" aria-label={title}>
      <div className="starter-picker-title"><span>{step}</span><h3>{title}</h3></div>
      <div className="starter-deck-grid compact">
        <button type="button" className={isDeckSelectionEqual(selection, { kind: "random" }) ? "selected" : ""} onClick={() => onChange({ kind: "random" })}>
          <span>ランダム</span><em>固定デッキと保存済みデッキから選択</em>
        </button>
      </div>
      {savedDecks.length > 0 && <div className="starter-deck-group"><h4>保存済み</h4><div className="starter-deck-grid compact">
        {savedDecks.map((deck) => {
          const validation = validateDeck(deck.cardIds);
          const value: DeckSelection = { kind: "saved", deckId: deck.id };
          return <button type="button" key={deck.id} className={isDeckSelectionEqual(selection, value) ? "selected" : ""} disabled={!validation.valid} title={validation.valid ? deck.name : validation.messages.join(" / ")} onClick={() => onChange(value)}><span>{deck.name}</span><em>{deck.cardIds.length}枚{validation.valid ? "" : ` / ${validation.messages[0]}`}</em></button>;
        })}
      </div></div>}
      <div className="starter-deck-group"><h4>固定デッキ</h4><div className="starter-deck-grid compact">
        {BATTLE_DECK_IDS.map((deckId) => {
          const value: DeckSelection = { kind: "preset", deckId };
          return <button type="button" key={deckId} className={isDeckSelectionEqual(selection, value) ? "selected" : ""} onClick={() => onChange(value)}><span>{DECKS[deckId].name}</span><em>{DECKS[deckId].description}</em></button>;
        })}
      </div></div>
    </section>
  );
}
