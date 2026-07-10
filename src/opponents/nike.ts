import rivalAttackVoice from "../assets/audio/voice/rival_attack.wav";
import rivalChargeVoice from "../assets/audio/voice/rival_charge.wav";
import rivalCommandVoice from "../assets/audio/voice/rival_command.wav";
import rivalCutInFinisherVoice from "../assets/audio/voice/rival_cutin_finisher.wav";
import rivalCutInTrumpVoice from "../assets/audio/voice/rival_cutin_trump.wav";
import rivalDamageTakenVoice from "../assets/audio/voice/rival_damage_taken.wav";
import rivalDefeatVoice from "../assets/audio/voice/rival_defeat.wav";
import rivalFieldDefenseVoice from "../assets/audio/voice/rival_field_defense.wav";
import rivalHandDefenseVoice from "../assets/audio/voice/rival_hand_defense.wav";
import rivalMatchStartVoice from "../assets/audio/voice/rival_match_start.wav";
import rivalMemoryVoice from "../assets/audio/voice/rival_memory.wav";
import rivalPlaySummonVoice from "../assets/audio/voice/rival_play_summon.wav";
import rivalTurnStartVoice from "../assets/audio/voice/rival_turn_start.wav";
import rivalUpgradeVoice from "../assets/audio/voice/rival_upgrade.wav";
import rivalVictoryVoice from "../assets/audio/voice/rival_victory.wav";
import rivalDefaultPortrait from "../assets/leader-rival-placeholder.webp";
import rivalHurtPortrait from "../assets/leader-rival-hurt.webp";
import rivalDelightPortrait from "../assets/leader-rival-delight.webp";
import rivalTrumpPortrait from "../assets/leader-rival-cutin-trump.webp";
import rivalFinisherPortrait from "../assets/leader-rival-cutin-finisher.webp";
import type { OpponentCharacterDefinition } from "./types";

export const NIKE_CHARACTER: OpponentCharacterDefinition = {
  id: "nike",
  defaultDisplayName: "ニケ",
  deckSelection: { kind: "random" },
  aiProfile: "challenger",
  portraits: {
    default: rivalDefaultPortrait,
    hurt: rivalHurtPortrait,
    delight: rivalDelightPortrait,
    cutInTrump: rivalTrumpPortrait,
    cutInFinisher: rivalFinisherPortrait,
  },
  lines: {
    match_start: { text: "では、ニケがお相手します。記録に残る一戦にしましょう！", audioSrc: rivalMatchStartVoice },
    rival_turn_start: { text: "さあ、あなたの腕を見せてください！", audioSrc: rivalTurnStartVoice },
    play_summon: { text: "この子でどうでしょう。たぶん、働いてくれるはずです。", audioSrc: rivalPlaySummonVoice },
    upgrade: { text: "ここで強化！この子はもっと強いですよ！", audioSrc: rivalUpgradeVoice },
    memory: { text: "少し準備します。魔女は道具に頼ってもいいので。", audioSrc: rivalMemoryVoice },
    charge: { text: "ここは溜めます。次の一手に託します！", audioSrc: rivalChargeVoice },
    attack: { text: "攻撃します！どんどんいきましょう！", audioSrc: rivalAttackVoice },
    field_defense: { text: "読めました。今のは少し嬉しいです。", audioSrc: rivalFieldDefenseVoice },
    hand_defense: { text: "その一撃は、手札で受けます。", audioSrc: rivalHandDefenseVoice },
    damage_taken: { text: "くっ……ちょっと痛いです。", audioSrc: rivalDamageTakenVoice },
    command: { text: "盤面を支配します！自由にされると困ります。", audioSrc: rivalCommandVoice },
    cutin_trump: { text: "ここで決めます…！！", audioSrc: rivalCutInTrumpVoice },
    cutin_finisher: { text: "これで最後です…！！", audioSrc: rivalCutInFinisherVoice },
    victory: { text: "私の…、勝ちです！……正直、かなり嬉しいです。", audioSrc: rivalVictoryVoice },
    defeat: { text: "負けました…。悔しいです。次は、頑張ります。", audioSrc: rivalDefeatVoice },
  },
};
