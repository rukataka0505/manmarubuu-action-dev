# 3D モデル差し替え契約仕様書（MODEL_CONTRACT.md）

本ドキュメントは、Astra max や大和田（Opus 5.5）が制作するハイディテール GLB モデルへ、主人公・巨大ボス「CLOCKWORK TOY KING」・ザコ敵3種を無改造（コード変更なし）で安全に差し替えるための正式契約を定義する。

---

## 1. マニフェストによる差し替え方法
`C:\Users\rukat\muse\manmarubuu-action\game-web\public\models\models_manifest.json` を編集するか、既存ファイルを同パスで上書きする。

```json
{
  "hero": "/models/manmarubuu_animated.glb",
  "heroExpressions": "/models/expressions_presets.json",
  "boss": "/models/clockwork_toy_king.glb",
  "enemySlime": null,
  "enemyTank": null,
  "enemyBalloon": null
}
```
※ `null` を指定したザコ敵スロットはネットワーク読み込みを行わず（404ゼロ）、組み込みの軽量プロシージャル3Dモデルを使用する。GLB パスを指定した場合は起動時に1回ロードされ、`SkeletonUtils.clone()` で複製配置される。

---

## 2. 共通座標系・原点ルール
- **形式**：`.glb`（glTF 2.0 バイナリ、`export_yup=True`）
- **向き**：Three.js 空間で **`+Z` 正面**（Blender 上では `-Y` 正面、上方向 `+Z`）。
- **原点**：キャラクターの足底中央（接地面）を `(0, 0, 0)` とする。
  - ボスや敵で高さがターゲット範囲から大きく外れている場合は `normalizeModelBounds()` が自動スケール＆底面 `y=0` 接地補正を行う。

---

## 3. 主人公「まんまるぶう」（`hero`）
- **推奨全高**：`1.0 m`
- **ボーン名（10ボーン）**：`Root`, `Belly`, `Head`, `Ear.L`, `Ear.R`, `Arm.L`, `Arm.R`, `Foot.L`, `Foot.R`, `Tail`
- **表情メッシュ規則**：`expressions_presets.json` に定義された全26個の `Face_*` ノードを `Head` ボーン配下（`ExpressionSocket` 等）に含めること。`Sleep` / `Ganbaru` はチーク（`Face_Blush_*`）を非表示にする。
- **アニメーションクリップ（20本）**：
  `Idle`, `Walk`, `Dash`, `Brake`, `Turn`, `JumpStart`, `DoubleJump`, `StompBounce`, `Fall`, `Land`, `TrampolineFly`, `HipDropStart`, `HipDropSlam`, `RollCharge`, `RollSpin`, `WallBounce`, `FeverBurst`, `Damage`, `Recover`, `VictoryDance`

---

## 4. 巨大ボス「CLOCKWORK TOY KING」（`boss`）
- **推奨全高**：`6.0 m`（ぶう比 1:6。`5.0m〜7.0m` の範囲外は自動で `6.0m` へ正規化される）
- **必須／推奨ノード名（いずれかの別名に一致すれば自動バインド）**：
  - 胴体・関節（プログラム制御用。無ければ静止せず全体移動＋任意アニメーションで動作）：
    - `BossRoot`
    - `Pelvis`
    - `Torso`（または `Chest`, `UpperBody`）
    - `Head`
    - `Shoulder_L` / `Shoulder.L` / `Arm_L` / `Arm.L`
    - `Shoulder_R` / `Shoulder.R` / `Arm_R` / `Arm.R`
    - `Leg_L` / `Leg.L`
    - `Leg_R` / `Leg.R`
  - **弱点・時計仕掛けノード**：
    - `BackWindupKey`（または `WindupKey`, `BackKey`, `WeakPointKey`）：背面（`-Z` 側）の金色ぜんまいネジ。常時回転し、スタン時はプレイヤーのヒップドロップ目標座標となる。
    - `BellyGear`（または `Gear_Belly`）、`WaistGearRing`（または `Gear_Waist`）：常時回転する装飾歯車。
  - **フェーズ進行で物理吹っ飛びする装甲ノード（任意・あると弾け飛ぶ）**：
    - 第1ヒット（HP 3→2）：`Armor_Shoulder_L`, `Armor_Shoulder_R`（別名 `Pauldron_L`, `Pauldron_R`）
    - 第2ヒット（HP 2→1）：`ChestFrontShield`, `Armor_Skirt_F`, `Armor_Skirt_B`
    - 第3ヒット（HP 1→0）：`Armor_Skirt_L`, `Armor_Skirt_R`, `CrownBand`
- **アニメーションクリップ対応（任意）**：
  - GLB 内に `Idle`, `Walk`, `Windup`, `Slam`, `Spin`, `Stunned`, `Hurt`, `Defeat`（大小文字不問・部分一致対応）のクリップが含まれている場合は、`THREE.AnimationMixer` が自動で連動再生する（ただし腕や胴のプログラム加算回転と競合しないよう、クリップがある場合は該当クリップ優先）。

---

## 5. ザコ敵3種（`enemySlime` / `enemyTank` / `enemyBalloon`）
- **推奨全高**：
  - `enemySlime`（ぷにゼリースライム）：約 `1.15 m`
  - `enemyTank`（ぜんまい豆タンク）：約 `1.4 m`（任意ノード `WindupKey` / `BackWindupKey` があれば自動回転）
  - `enemyBalloon`（プロペラ風船敵）：約 `1.6 m`（任意ノード `Propeller` / `Rotor` があれば高速回転）
- 差し替え時は、内蔵ビジュアルを非表示にしつつ、`group` 配下へ差し替え GLB を装着する。既存の当たり判定・踏みつけ・吹っ飛び・アニメーション再生（最初のクリップが存在すればループ再生）はそのまま維持される。
