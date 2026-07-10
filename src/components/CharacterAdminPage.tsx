import { useMemo, useState } from "react";
import { BATTLE_DECK_IDS, DECKS, type AiProfile } from "../game";
import type { DeckSelection } from "../duelSetup";
import type { SavedDeck } from "../savedDecks";
import {
  OPPONENT_PORTRAIT_LABELS,
  OPPONENT_PORTRAIT_ASPECT_RATIOS,
  OPPONENT_VOICE_CUE_LABELS,
  OPPONENT_VOICE_CUES,
  createEmptySavedOpponentCharacter,
  readFileAsDataUrl,
  validateSavedOpponentCharacter,
} from "../opponents/characterStorage";
import { deckSelectionLabel } from "../duelSetup";
import { opponentAiProfile, opponentDeckSelection, opponentPortrait } from "../opponents/catalog";
import type {
  OpponentCharacterDefinition,
  OpponentPortraitKind,
  OpponentVoiceCue,
  SavedOpponentCharacter,
} from "../opponents/types";

type AdminTab = "basic" | "portraits" | "voices";

const PORTRAIT_KINDS = Object.keys(OPPONENT_PORTRAIT_LABELS) as OpponentPortraitKind[];

export function CharacterAdminPage({
  builtInCharacters,
  savedCharacters,
  savedDecks,
  onSave,
  onDelete,
}: {
  builtInCharacters: readonly OpponentCharacterDefinition[];
  savedCharacters: SavedOpponentCharacter[];
  savedDecks: SavedDeck[];
  onSave: (character: SavedOpponentCharacter) => Promise<void>;
  onDelete: (characterId: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(builtInCharacters[0]?.id ?? "");
  const [draft, setDraft] = useState<SavedOpponentCharacter | null>(null);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("basic");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const selectedBuiltIn = builtInCharacters.find((character) => character.id === selectedId) ?? null;
  const filteredBuiltIns = builtInCharacters.filter((character) => character.defaultDisplayName.toLowerCase().includes(search.toLowerCase()) || character.id.includes(search.toLowerCase()));
  const filteredSaved = savedCharacters.filter((character) => character.defaultDisplayName.toLowerCase().includes(search.toLowerCase()) || character.id.includes(search.toLowerCase()));
  const validationErrors = useMemo(() => draft ? validateSavedOpponentCharacter(draft) : [], [draft]);

  function selectBuiltIn(character: OpponentCharacterDefinition) {
    setSelectedId(character.id);
    setDraft(null);
    setEditingOriginalId(null);
    setMessage(null);
  }

  function beginNew() {
    setSelectedId("");
    setDraft(createEmptySavedOpponentCharacter());
    setEditingOriginalId(null);
    setTab("basic");
    setMessage(null);
  }

  function beginEdit(character: SavedOpponentCharacter) {
    setSelectedId(character.id);
    setDraft(structuredClone(character));
    setEditingOriginalId(character.id);
    setTab("basic");
    setMessage(null);
  }

  async function saveDraft() {
    if (!draft || validationErrors.length > 0) return;
    if (builtInCharacters.some((character) => character.id === draft.id)) {
      setMessage("組み込みキャラクターと同じIDは使用できません");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await onSave({ ...draft, updatedAt: new Date().toISOString() });
      setEditingOriginalId(draft.id);
      setSelectedId(draft.id);
      setMessage("キャラクターを保存しました。対戦相手の選択肢へ反映されています。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "キャラクターを保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!editingOriginalId || !window.confirm(`「${draft?.defaultDisplayName ?? editingOriginalId}」を削除しますか？`)) return;
    setBusy(true);
    try {
      await onDelete(editingOriginalId);
      selectBuiltIn(builtInCharacters[0]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "キャラクターを削除できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function setPortraitFile(kind: OpponentPortraitKind, file: File | undefined) {
    if (!draft || !file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraft({
      ...draft,
      portraits: { ...draft.portraits, [kind]: dataUrl },
      assetNames: { ...draft.assetNames, portraits: { ...draft.assetNames.portraits, [kind]: file.name } },
    });
  }

  function removePortrait(kind: OpponentPortraitKind) {
    if (!draft) return;
    const portraits = { ...draft.portraits };
    const names = { ...draft.assetNames.portraits };
    if (kind === "default") portraits.default = "";
    else delete portraits[kind];
    delete names[kind];
    setDraft({ ...draft, portraits, assetNames: { ...draft.assetNames, portraits: names } });
  }

  function updateLine(cue: OpponentVoiceCue, text: string) {
    if (!draft) return;
    setDraft({ ...draft, lines: { ...draft.lines, [cue]: { ...draft.lines[cue], text } } });
  }

  async function setAudioFile(cue: OpponentVoiceCue, file: File | undefined) {
    if (!draft || !file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraft({
      ...draft,
      lines: { ...draft.lines, [cue]: { text: draft.lines[cue]?.text ?? "", audioSrc: dataUrl } },
      assetNames: { ...draft.assetNames, audio: { ...draft.assetNames.audio, [cue]: file.name } },
    });
  }

  function removeAudio(cue: OpponentVoiceCue) {
    if (!draft) return;
    const audioNames = { ...draft.assetNames.audio };
    delete audioNames[cue];
    setDraft({
      ...draft,
      lines: { ...draft.lines, [cue]: { text: draft.lines[cue]?.text ?? "" } },
      assetNames: { ...draft.assetNames, audio: audioNames },
    });
  }

  function previewAudio(cue: OpponentVoiceCue) {
    const source = draft?.lines[cue]?.audioSrc;
    if (!source) return;
    void new Audio(source).play();
  }

  return (
    <div className="character-admin-page">
      <aside className="character-admin-sidebar">
        <div className="character-admin-sidebar-head">
          <span>CHARACTER ADMIN</span>
          <h2>キャラクター管理</h2>
          <p>対戦相手のイラスト、セリフ、音声を登録します。</p>
        </div>
        <button type="button" className="primary-action character-admin-new" onClick={beginNew}>＋ 新しいキャラクター</button>
        <label className="character-admin-search">
          <span>検索</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="名前またはID" />
        </label>
        <div className="character-admin-list">
          {filteredBuiltIns.map((character) => (
            <button type="button" className={selectedId === character.id && !draft ? "selected" : ""} key={character.id} onClick={() => selectBuiltIn(character)}>
              <img src={character.portraits.default} alt="" />
              <span><strong>{character.defaultDisplayName}</strong><small>{character.id}</small><em>組み込み</em></span>
            </button>
          ))}
          {filteredSaved.map((character) => (
            <button type="button" className={selectedId === character.id && Boolean(draft) ? "selected" : ""} key={character.id} onClick={() => beginEdit(character)}>
              <img src={character.portraits.default} alt="" />
              <span><strong>{character.defaultDisplayName}</strong><small>{character.id}</small><em>カスタム</em></span>
            </button>
          ))}
        </div>
      </aside>

      <section className="character-admin-workspace">
        {draft ? (
          <>
            <header className="character-admin-editor-head">
              <div><span>{editingOriginalId ? "EDIT CHARACTER" : "NEW CHARACTER"}</span><h2>{draft.defaultDisplayName || "新しいキャラクター"}</h2></div>
              <div className="character-admin-status"><i />{editingOriginalId ? "保存済みキャラクター" : "未保存"}</div>
            </header>
            <nav className="character-admin-tabs" aria-label="キャラクター編集項目">
              <button type="button" className={tab === "basic" ? "active" : ""} onClick={() => setTab("basic")}>基本情報</button>
              <button type="button" className={tab === "portraits" ? "active" : ""} onClick={() => setTab("portraits")}>イラスト <span>{Object.values(draft.portraits).filter(Boolean).length}/5</span></button>
              <button type="button" className={tab === "voices" ? "active" : ""} onClick={() => setTab("voices")}>セリフと音声 <span>{Object.values(draft.lines).filter((line) => line?.text).length}/15</span></button>
            </nav>

            <div className="character-admin-editor-body">
              {tab === "basic" && (
                <section className="character-admin-basic">
                  <div className="character-admin-section-title"><span>01</span><div><h3>基本情報</h3><p>ゲーム内でキャラクターを識別する名前とIDです。</p></div></div>
                  <div className="character-admin-basic-grid">
                    <label>表示名<input value={draft.defaultDisplayName} maxLength={30} onChange={(event) => setDraft({ ...draft, defaultDisplayName: event.target.value })} placeholder="例: アストラ" /></label>
                    <label>キャラクターID<input value={draft.id} disabled={Boolean(editingOriginalId)} maxLength={32} onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="例: astra" /><small>半角英小文字・数字・ハイフン。保存後は変更できません。</small></label>
                    <label>使用デッキ
                      <select value={deckSelectionValue(draft.deckSelection ?? { kind: "random" })} onChange={(event) => setDraft({ ...draft, deckSelection: deckSelectionFromValue(event.target.value) })}>
                        <option value="random">ランダム</option>
                        <optgroup label="固定デッキ">
                          {BATTLE_DECK_IDS.map((deckId) => <option key={deckId} value={`preset:${deckId}`}>{DECKS[deckId].name}</option>)}
                        </optgroup>
                        {savedDecks.length > 0 && <optgroup label="保存済みデッキ">
                          {savedDecks.map((deck) => <option key={deck.id} value={`saved:${deck.id}`}>{deck.name}</option>)}
                        </optgroup>}
                      </select>
                      <small>このキャラクターが対戦時に使用するデッキです。</small>
                    </label>
                    <label>CPU難易度
                      <select value={draft.aiProfile ?? "challenger"} onChange={(event) => setDraft({ ...draft, aiProfile: event.target.value as AiProfile })}>
                        <option value="beginner">初心者</option>
                        <option value="challenger">挑戦者</option>
                      </select>
                      <small>対戦準備では変更せず、この設定を使用します。</small>
                    </label>
                  </div>
                  <div className="character-admin-preview-card">
                    {draft.portraits.default ? <img src={draft.portraits.default} alt="通常立ち絵プレビュー" /> : <div className="character-admin-preview-empty">通常立ち絵を登録すると<br />ここに表示されます</div>}
                    <div><span>GAME PREVIEW</span><strong>{draft.defaultDisplayName || "キャラクター名"}</strong><small>ID: {draft.id || "character-id"}</small></div>
                  </div>
                </section>
              )}

              {tab === "portraits" && (
                <section>
                  <div className="character-admin-section-title"><span>02</span><div><h3>イラスト</h3><p>場面ごとに使用する5種類の画像を登録します。通常立ち絵のみ必須です。</p></div></div>
                  <div className="character-portrait-grid">
                    {PORTRAIT_KINDS.map((kind) => {
                      const source = draft.portraits[kind];
                      return (
                        <article className={source ? "has-asset" : ""} key={kind}>
                          <div className="character-portrait-preview">{source ? <img src={source} alt="" /> : <span>NO IMAGE</span>}</div>
                          <div className="character-portrait-meta">
                            <strong>{OPPONENT_PORTRAIT_LABELS[kind]}{kind === "default" && <em>必須</em>}</strong>
                            <span>推奨 {OPPONENT_PORTRAIT_ASPECT_RATIOS[kind]}</span>
                            <small>{draft.assetNames.portraits[kind] ?? "未登録"}</small>
                          </div>
                          <div className="character-asset-actions">
                            <label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void setPortraitFile(kind, event.target.files?.[0])} />{source ? "差し替え" : "画像を選択"}</label>
                            {source && <button type="button" onClick={() => removePortrait(kind)}>削除</button>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {tab === "voices" && (
                <section>
                  <div className="character-admin-section-title"><span>03</span><div><h3>セリフと音声</h3><p>15種類のゲームイベントごとに表示テキストと音声ファイルを設定します。</p></div></div>
                  <div className="character-voice-guideline" role="note">
                    <strong>推奨尺</strong>
                    <span>全セリフ共通で 1.5〜3秒程度</span>
                    <small>テンポを保つための共通目安です。</small>
                  </div>
                  <div className="character-voice-table">
                    <div className="character-voice-head"><span>イベント</span><span>表示セリフ</span><span>音声ファイル</span></div>
                    {OPPONENT_VOICE_CUES.map((cue) => {
                      const line = draft.lines[cue];
                      return (
                        <div className="character-voice-row" key={cue}>
                          <div><strong>{OPPONENT_VOICE_CUE_LABELS[cue]}</strong><small>{cue}</small></div>
                          <textarea rows={2} value={line?.text ?? ""} onChange={(event) => updateLine(cue, event.target.value)} placeholder="この場面で表示するセリフ" />
                          <div className="character-audio-cell">
                            <span title={draft.assetNames.audio[cue]}>{draft.assetNames.audio[cue] ?? "音声なし"}</span>
                            <div>
                              <label><input type="file" accept="audio/wav,audio/mpeg,audio/ogg,audio/mp4" onChange={(event) => void setAudioFile(cue, event.target.files?.[0])} />{line?.audioSrc ? "差替" : "選択"}</label>
                              <button type="button" disabled={!line?.audioSrc} onClick={() => previewAudio(cue)}>試聴</button>
                              {line?.audioSrc && <button type="button" onClick={() => removeAudio(cue)}>削除</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <footer className="character-admin-footer">
              <div>
                {message && <p>{message}</p>}
                {!message && validationErrors.length > 0 && <p>{validationErrors[0]}</p>}
              </div>
              {editingOriginalId && <button type="button" className="danger-action" disabled={busy} onClick={() => void removeDraft()}>キャラクターを削除</button>}
              <button type="button" disabled={busy} onClick={() => editingOriginalId ? beginEdit(savedCharacters.find((character) => character.id === editingOriginalId)!) : beginNew()}>変更を戻す</button>
              <button type="button" className="primary-action" disabled={busy || validationErrors.length > 0} onClick={() => void saveDraft()}>{busy ? "保存中..." : "保存して反映"}</button>
            </footer>
          </>
        ) : selectedBuiltIn ? (
          <BuiltInCharacterView character={selectedBuiltIn} savedDecks={savedDecks} onCreate={beginNew} />
        ) : (
          <div className="character-admin-empty"><h2>キャラクターを選択してください</h2><button type="button" className="primary-action" onClick={beginNew}>新しいキャラクター</button></div>
        )}
      </section>
    </div>
  );
}

function deckSelectionValue(selection: DeckSelection): string {
  if (selection.kind === "random") return "random";
  return `${selection.kind}:${selection.deckId}`;
}

function deckSelectionFromValue(value: string): DeckSelection {
  if (value === "random") return { kind: "random" };
  const [kind, deckId] = value.split(":", 2);
  return kind === "saved" ? { kind: "saved", deckId } : { kind: "preset", deckId: deckId as (typeof BATTLE_DECK_IDS)[number] };
}

function BuiltInCharacterView({ character, savedDecks, onCreate }: { character: OpponentCharacterDefinition; savedDecks: SavedDeck[]; onCreate: () => void }) {
  return (
    <div className="character-admin-builtin">
      <header className="character-admin-editor-head"><div><span>BUILT-IN CHARACTER</span><h2>{character.defaultDisplayName}</h2></div><div className="character-admin-status builtin"><i />組み込み</div></header>
      <div className="character-admin-builtin-body">
        <div className="character-admin-builtin-hero"><img src={opponentPortrait(character, "default")} alt="" /><div><span>CHARACTER ID</span><strong>{character.id}</strong><p>使用デッキ: {deckSelectionLabel(opponentDeckSelection(character), savedDecks)} / CPU: {opponentAiProfile(character) === "beginner" ? "初心者" : "挑戦者"}</p><p>組み込みキャラクターはソース管理されています。新しいキャラクターは管理画面から追加できます。</p><button type="button" className="primary-action" onClick={onCreate}>＋ 新しいキャラクターを追加</button></div></div>
        <section><h3>登録イラスト</h3><div className="character-admin-builtin-portraits">{PORTRAIT_KINDS.map((kind) => <figure key={kind}><img src={opponentPortrait(character, kind)} alt="" /><figcaption>{OPPONENT_PORTRAIT_LABELS[kind]}</figcaption></figure>)}</div></section>
        <section><h3>セリフ・音声</h3><p>{Object.keys(character.lines).length} / {OPPONENT_VOICE_CUES.length} イベント登録済み</p></section>
      </div>
    </div>
  );
}
