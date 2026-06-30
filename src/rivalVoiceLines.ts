import rivalAttackVoice from "./assets/audio/voice/rival_attack.wav";
import rivalChargeVoice from "./assets/audio/voice/rival_charge.wav";
import rivalCommandVoice from "./assets/audio/voice/rival_command.wav";
import rivalDamageTakenVoice from "./assets/audio/voice/rival_damage_taken.wav";
import rivalDefeatVoice from "./assets/audio/voice/rival_defeat.wav";
import rivalFieldDefenseVoice from "./assets/audio/voice/rival_field_defense.wav";
import rivalHandDefenseVoice from "./assets/audio/voice/rival_hand_defense.wav";
import rivalMatchStartVoice from "./assets/audio/voice/rival_match_start.wav";
import rivalMemoryVoice from "./assets/audio/voice/rival_memory.wav";
import rivalPlaySummonVoice from "./assets/audio/voice/rival_play_summon.wav";
import rivalTurnStartVoice from "./assets/audio/voice/rival_turn_start.wav";
import rivalUpgradeVoice from "./assets/audio/voice/rival_upgrade.wav";
import rivalVictoryVoice from "./assets/audio/voice/rival_victory.wav";

export type RivalVoiceLineId =
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
  | "victory"
  | "defeat";

export type RivalVoiceLine = {
  text: string;
  src: string;
};

export const RIVAL_VOICE_LINES: Record<RivalVoiceLineId, RivalVoiceLine> = {
  match_start: {
    text: "では、ニケがお相手します。記録に残る一戦にしましょう！",
    src: rivalMatchStartVoice,
  },
  rival_turn_start: {
    text: "さあ、あなたの腕を見せてください！",
    src: rivalTurnStartVoice,
  },
  play_summon: {
    text: "この子でどうでしょう。たぶん、働いてくれるはずです。",
    src: rivalPlaySummonVoice,
  },
  upgrade: {
    text: "ここで強化！この子はもっと強いですよ！",
    src: rivalUpgradeVoice,
  },
  memory: {
    text: "少し準備します。魔女は道具に頼ってもいいので。",
    src: rivalMemoryVoice,
  },
  charge: {
    text: "ここは溜めます。次の一手に託します！",
    src: rivalChargeVoice,
  },
  attack: {
    text: "攻撃します！どんどんいきましょう！",
    src: rivalAttackVoice,
  },
  field_defense: {
    text: "読めました。今のは少し嬉しいです。",
    src: rivalFieldDefenseVoice,
  },
  hand_defense: {
    text: "その一撃は、手札で受けます。",
    src: rivalHandDefenseVoice,
  },
  damage_taken: {
    text: "くっ……ちょっと痛いです。",
    src: rivalDamageTakenVoice,
  },
  command: {
    text: "盤面を支配します！自由にされると困ります。",
    src: rivalCommandVoice,
  },
  victory: {
    text: "私の…、勝ちです！……正直、かなり嬉しいです。",
    src: rivalVictoryVoice,
  },
  defeat: {
    text: "負けました…。悔しいです。次は、頑張ります。",
    src: rivalDefeatVoice,
  },
};
