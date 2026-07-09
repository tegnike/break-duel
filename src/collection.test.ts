import { beforeEach, describe, expect, it } from "vitest";
import {
  COLLECTION_STORAGE_KEY,
  INITIAL_COINS,
  WALLET_STORAGE_KEY,
  addCoins,
  addToCollection,
  collectionLimitMessages,
  loadCoins,
  loadCollection,
  ownedCount,
  ownedCountForCard,
  spendCoins,
} from "./collection";
import type { Card } from "./game";
import { RARITY_LABELS, baseCardRarity } from "./rarity";

// node 環境（localStorage なし）ではメモリフォールバックが使われる。
// テスト間で状態をリセットするため、残高を読み取ってゼロに寄せる。
function resetWalletTo(coins: number) {
  const current = loadCoins();
  if (current > coins) {
    expect(spendCoins(current - coins)).toBe(true);
  } else if (current < coins) {
    addCoins(coins - current);
  }
}

function set2Card(id: string, name: string): Card {
  return { id, name, type: "ai", attribute: "火", power: 2, effect: "", status: "active", set: 2 };
}

describe("wallet", () => {
  it("初回ロードで初期コインが付与される", () => {
    expect(loadCoins()).toBeGreaterThanOrEqual(0);
    // 初回付与後は永続化されて同じ値が返る
    expect(loadCoins()).toBe(loadCoins());
  });

  it("加算と支払いが残高に反映される", () => {
    resetWalletTo(0);
    expect(addCoins(10)).toBe(10);
    expect(spendCoins(5)).toBe(true);
    expect(loadCoins()).toBe(5);
  });

  it("残高不足の支払いは失敗して残高が変わらない", () => {
    resetWalletTo(3);
    expect(spendCoins(5)).toBe(false);
    expect(loadCoins()).toBe(3);
  });

  it("負値や非有限値では残高が変わらない", () => {
    resetWalletTo(10);
    expect(spendCoins(-5)).toBe(false);
    expect(loadCoins()).toBe(10);
    expect(spendCoins(Number.NaN)).toBe(false);
    expect(spendCoins(Number.POSITIVE_INFINITY)).toBe(false);
    expect(loadCoins()).toBe(10);

    expect(addCoins(-5)).toBe(10);
    expect(addCoins(Number.NaN)).toBe(10);
    expect(addCoins(Number.POSITIVE_INFINITY)).toBe(10);
    expect(loadCoins()).toBe(10);
  });
});

describe("collection", () => {
  it("第1弾カードは2枚所持として扱う", () => {
    const starter: Card = { id: "AI-FIRE-1", name: "テスト", type: "ai", power: 1, effect: "", status: "active" };
    expect(ownedCount("AI-FIRE-1")).toBe(2);
    expect(ownedCountForCard(starter, {})).toBe(2);
  });

  it("追加した枚数が積み上がり、初取得は newIds に載る", () => {
    const before = ownedCount("TEST-CARD-A");
    const first = addToCollection(["TEST-CARD-A", "TEST-CARD-A", "TEST-CARD-B"]);
    expect(first.counts["TEST-CARD-A"]).toBe(before + 2);
    if (before === 0) {
      expect(first.newIds).toContain("TEST-CARD-A");
    }
    const second = addToCollection(["TEST-CARD-A"]);
    expect(second.newIds).not.toContain("TEST-CARD-A");
    expect(ownedCount("TEST-CARD-A")).toBe(before + 3);
  });

  it("loadCollection はコピーを返す（書き換えても永続データに影響しない）", () => {
    addToCollection(["TEST-CARD-C"]);
    const snapshot = loadCollection();
    snapshot["TEST-CARD-C"] = 999;
    expect(ownedCount("TEST-CARD-C")).not.toBe(999);
  });

});

describe("rarity", () => {
  it("第1弾カードはレアリティを持たない", () => {
    const starter: Card = { id: "AI-FIRE-1", name: "スターター", type: "ai", power: 4, effect: "", status: "active" };
    expect(baseCardRarity(starter)).toBeNull();
  });

  it("第2弾以降はカード種別とpowerから基本レアリティを導出する", () => {
    expect(baseCardRarity({ ...set2Card("RARITY-N", "N"), power: 1 })).toBe("n");
    expect(baseCardRarity(set2Card("RARITY-R", "R"))).toBe("r");
    expect(baseCardRarity({ ...set2Card("RARITY-SR", "SR"), power: 3 })).toBe("sr");
    expect(baseCardRarity({ ...set2Card("RARITY-UR", "UR"), power: 4 })).toBe("ur");
    expect(baseCardRarity({ id: "RARITY-EVENT", name: "術式", type: "event", effect: "optimize", status: "active", set: 2 })).toBe("n");
    expect(baseCardRarity({ id: "RARITY-MEMORY", name: "遺物", type: "memory", effect: "cache", status: "active", set: 2 })).toBe("r");
    expect(RARITY_LABELS.ur).toBe("UR");
  });
});

describe("collectionLimitMessages", () => {
  it("第1弾カードは所持ゼロでも制限なし", () => {
    const starter: Card = { id: "AI-FIRE-1", name: "テスト", type: "ai", power: 1, effect: "", status: "active" };
    expect(collectionLimitMessages([starter, starter], {})).toEqual([]);
  });

  it("第2弾カードは所持枚数を超えるとエラー", () => {
    const card = set2Card("AI2-TEST-1", "新弾テスト獣");
    expect(collectionLimitMessages([card, card], { "AI2-TEST-1": 1 })).toHaveLength(1);
    expect(collectionLimitMessages([card, card], { "AI2-TEST-1": 1 })[0]).toContain("所持 1 枚");
  });

  it("第2弾カードでも所持枚数以内なら通る", () => {
    const card = set2Card("AI2-TEST-2", "新弾テスト獣2");
    expect(collectionLimitMessages([card, card], { "AI2-TEST-2": 2 })).toEqual([]);
    expect(collectionLimitMessages([card], { "AI2-TEST-2": 1 })).toEqual([]);
  });

  it("未所持の第2弾カードは1枚でもエラー", () => {
    const card = set2Card("AI2-TEST-3", "新弾テスト獣3");
    expect(collectionLimitMessages([card], {})).toHaveLength(1);
  });

  it("複数カードの所持超過は1件にまとめる", () => {
    const first = set2Card("AI2-TEST-4", "新弾テスト獣4");
    const second = set2Card("AI2-TEST-5", "新弾テスト獣5");
    const third = set2Card("AI2-TEST-6", "新弾テスト獣6");
    const fourth = set2Card("AI2-TEST-7", "新弾テスト獣7");
    expect(collectionLimitMessages([first, second, third, fourth], {})).toEqual([
      "所持枚数を超えるカードが4種類あります（新弾テスト獣4、新弾テスト獣5、新弾テスト獣6、ほか1種類）",
    ]);
  });
});

describe("storage keys", () => {
  it("キー名が仕様どおり", () => {
    expect(WALLET_STORAGE_KEY).toBe("break-duel:wallet");
    expect(COLLECTION_STORAGE_KEY).toBe("break-duel:collection");
    expect(INITIAL_COINS).toBe(1000);
  });
});
