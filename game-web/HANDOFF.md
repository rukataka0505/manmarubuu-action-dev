# HANDOFF.md — まんまるぶう：おもちゃばこ大暴走！（Three.js 版）

更新：2026-11-19 18:15 / 作成・引継ぎ者：F（Orchestrator Carbon）

## 0. 現在の状態と停止理由（チェックポイント）
- **停止理由**：相棒の「一旦 PC の電源を落とすため、キリの良いところで作業を止めて引継ぎを用意してほしい」という指示に基づくクリーン停止ポイント。
- **現在の到達状態**：Round 1 レビュー（`qa-shots/review_round_1.md`）の **P0 / P1 / P2 全修正**、相棒の追加指示（**雑魚敵・ゲームデザイン含む聖域ゼロ品質**）への対応、および **Astra max (`gpt-6.1-sol`) による新ボスモデル `boss_king_v2.glb` の正式採用** まで完了。
- **品質検証状況**：直前に `npx tsc --noEmit` → `npm run build` → `node scripts/verify_playthrough.mjs` を回し、**75FPS・エラー 0・`PLAYTHROUGH_QA_OK`（exit 0）** を確認済み。最新スクショ 17 枚すべてを自分の目で開いて目視検品済み。実行中のバックグラウンドプロセス・開発サーバーはすべて終了済みで、このまま安全に PC の電源を落とせる状態。
- **未完了（次セッションで実施）**：第三者辛口レビュー **Round 2（`review_round_2.md`）** の依頼と、下記の目視検品メモを含む仕上げ改善ループ（AAA 級合格まで）。

---

## 1. 相棒の確定方針＆絶対ルール（変えない・壊さない）
1. **3D アセットは完全自作（Blender 5.2）**：既製サードパーティ 3D モデルは使用禁止。借りてよいのは `public/textures/pbr/`・`public/hdri/` の Poly Haven PBR/HDRI と `public/audio/` の CC0 音源のみ。
2. **目標画の正本**：`C:\Users\rukat\muse\manmarubuu-action\art-bible\`
   - フィールド目標：`07_target_map_field_nintendo.jpg` × `08_target_map_field_diorama.jpg`
   - 敵・小物目標：`02_enemies_props.jpg`
   - ボス・アリーナ目標：`03_boss_clockwork_toy_king.jpg` × `09_target_map_boss_arena.jpg`
3. **聖域ゼロ品質（2026-11-19 17:38 相棒追加指示）**：雑魚敵 3 種（`JellySlime`, `WindupTank`, `PropellerBalloon`）やゲームデザイン細部（丸影、予兆、操作感、達成演出等）も含め例外を作らず最高品質にする。
4. **渡真利（1017 / `mcp__1017__*`）は原則一切使わない**（`DECISIONS.md`）。主役級造形には Astra max（Codex `run_codex.py --tier power`）または大和田（Opus 5.5）を使用可。
5. **壊してはいけない保護資産**：
   - 主人公：`public/models/manmarubuu_animated.glb`（20 モーション・10 ボーン・8 表情）、`public/models/expressions_presets.json`、`src/character/{ManmarubuuView.ts, ExpressionLogic.ts}`、`src/core/FaceWipeRenderer.ts`（**`Sleep` / `Ganbaru` はチーク完全 OFF**、口は鼻の下）。
   - 大和田の UI：`src/ui/{HudManager.ts, Screens.ts}`、`src/styles.css`。
   - マリオ流の基本操作・Rapier 物理・カメラ操作（自由 3D カメラ）・5 ステップチュートリアル・サウンド（`src/audio/SoundEngine.ts`）。
6. **品質ゲート**：数値アサートだけでなく **必ず全スクショを `read_file` で自分の目で確認** し、第三者（別セッション Neon＝`f_start`、または大和田＝`claude_start`）に目標画と実スクショで辛口レビューを依頼し、**AAA 級合格（P0/P1 ゼロ）まで改善ループ** を回す。

---

## 2. 本セッションで完了したこと（詳細）

### A. `public/models/ai/` 由来調査と Blender 自作確定・刷新
- `ai-pipeline/generation_report.json` により、`ai/{boss_king,windup_tank,propeller_balloon,cushion,gift_box}.glb` の 5 点すべてが ZeroGPU クォータ都合のフォールバックとして **Blender 5.2 完全自作（`blender/process_and_qa_assets.py`）** で生成されたと確定。
- `windup_tank.glb`（20,548 tris：各車輪 12 立体トレッド・太い木製大砲・大型真鍮ぜんまい）、`propeller_balloon.glb`（14,612 tris：clearcoat 1.0・6 パネル帽・曲面プロペラ）、`cushion.glb`（9,216 tris：繊細ステッチ `0.0028`）を再造形・再出力。
- **新ボスモデル正式採用**：Codex Astra max（`gpt-6.1-sol` / `effort: high`）で `blender/build_boss_king_v2.py` から `boss_king_v2.glb` を制作・QA 検証し、`public/models/ai/boss_king.glb`（`7,217,948` bytes）へ正式反映（旧版は `blender/boss_king_v1_backup.glb`（`1,451,240` bytes）に退避）。
  - 仕様検証済み（`blender/boss_v2_runtime_qa.json`）：**55,452 三角形**、幅 `4.46m` × 奥行 `3.07m` × 高さ `6.02m`、内蔵画像 12 枚、全 19 契約ノード（`BossRoot`, `Pelvis`, `Torso`, `Head`, `Shoulder_L/R`, `Leg_L/R`, `BackWindupKey`, `BellyGear`, `WaistGearRing`, 分離装甲 8 パーツ）および回転軸・原点オフセット検証 PASS。

### B. Round 1 指摘（P0〜P2）の全面修正
- **P0-1 西ピンクすべり台自己交差解消**（`World1Builder.ts`）：幅 3.4m・20 点閉断面 U 字シェル＋外向きワインディング・終端高さクランプに刷新。物理メッシュも表裏整合済み。
- **P0-2 スターゲート浮遊解消＆虹の橋刷新**（`Gimmicks.ts`）：時計ゲートを島内 `(0, 1.2, -13.2)` に接地。虹の橋（`z = -24.0` 付近）にウォールナット木枠＆真鍮縁を追加。
- **P0-3 アルファベット積み木鏡文字・逆さ解消**（`build_diorama_world_assets.py`＋`ProceduralTextures.ts`）：`apply_cube_face_uv` を 6 面符号付き接線軸展開へ修正し、`makeAlphabetBlockTexture` に `tex.flipY = false` を設定。A〜Z 全文字が正立正像に改善。
- **P0-4 東ドミノ＆クッション座標重複解消**（`World1Builder.ts`＋`ToyBlocksManager.ts`）：東ドミノ 16 本を `'east'` タグ管理しクッション 1〜4（`x=26.8..30.2, z=12.2..2.3`）と分離。開始時非倒壊（16/16 直立）をテストで検証。
- **P1/P2 環境・建築・ジオラマ刷新**：
  - 面取り木枠＋スラット積みの `toy_platform_slab.glb`・ステッチ入り `checkpoint_flag_felt.glb` を自作追加し、Box 足場と単色板旗を置換。ボス戦旗は `(-3.8, 1.2, -12.0)` へ退避。
  - ボスアリーナ：`boss_arena_deck.glb` 放射状木目板張り（`MAT_DarkWalnut` 光沢クリアコート仕上げ）、`OuterWalnutRim` 内径 `17.10`、ガラスピット透明化＋内部 5 灯暖色ライト、真鍮発色強化、2 層星空＆マジックアワー夕暮れ空＆7 パフ平底夕雲、ボス戦遷移時の遠景丘陵フェード（`terrain.updateBossMood(nextMood)` を `main.ts` に接続）。
  - デニム縁：96 分割・テラス交差部カット（`finalizeTerraceRims`＋`RimCutout`）・細い丸カプセルステッチ。
  - 若草 3D 草原 `15,077` 株、太糸ケーブルニットラグ（Sobel 法線マップ付き・角ステッチ食い込み解消）、飛び石 `1.22〜1.38` 倍化、小家・城門・トランポリン造形強化、N8AO 高精細設定＋12 タップ Poisson TiltShift、昼雲ハーフランバート白化。

### C. 雑魚敵・ボス演出・ゲームデザイン強化
- **ぶう足元ソフト丸影ドロップシャドウ**（`src/main.ts`）：64x64 グラデーション円盤が `physics.castGroundRay` で毎フレーム床に追従（ジャンプ高度に応じて縮小・減衰）。
- **雑魚敵 3 種**（`JellySlime.ts`, `WindupTank.ts`, `PropellerBalloon.ts`）：スライムの下膨れ水滴ジオメトリ・内部発光コア・18 気泡・着地ぷるん揺れ・丸影、ぜんまいタンクの 4 ステート AI（`patrol → telegraph(0.55s 赤「！」＆震え) → charge → cooldown`）、バルーンのポップ膨張リスポーン＆落下点ターゲットリング。
- **ボス気絶ピヨピヨ星＆アイテム視認性**（`ClockworkToyKing.ts`, `Collectibles.ts`）：気絶時に頭上 3 星回転リング `stunStarsGroup`、コイン表面に王冠エンボス `coinCrown`、パワースターに加算発光グロー `Sprite`。
- **操作アシスト＆検品安定化**：`ManmarubuuController.ts` にすべり台転がり滑走アシストを追加。`scripts/verify_playthrough.mjs` に東ドミノ非倒壊・草原・ディオラマ点数アサート追加、`07_rainbow_bridge.png` 座標調整、さらに終了時 `taskkill` 同期化＋`process.exit(0)` でゾンビプロセスを防止。

### D. 直近のビルド＆Playwright 検品結果（2026-11-19 18:10〜18:11 実行）
- `npx tsc --noEmit` & `npm run build`：**exit 0**（1.84s、型エラー 0）
- `node scripts/verify_playthrough.mjs`：**exit 0（`PLAYTHROUGH_QA_OK`）**
  - `Loaded clips: 20`
  - `Environment stats`: `hdriLoaded: true`, `n8aoEnabled: true`, `grassClusters: 15077`, `pbrTexturesLoaded: 30`, `dioramaTemplatesLoaded: 37`
  - `External audio status`: 5 BGM / 13 SFX ロード完了
  - `East dominos`: `{"total":16,"standing":16,"fallen":0}`
  - `Measured FPS: 75`
  - `Failed URLs: []` / `Console errors: 0` / `Page errors: 0`

---

## 3. 最新 `qa-shots/*.png`（17 枚）自前目視検品所見と残課題メモ

### 確認できた大きな成果
- ピンクすべり台（`01`, `04`, `06`, `06b`）、A〜Z 積み木正立文字（`02`, `02b`, `04b`）、東ドミノ 16 本直立（`05b`）、ケーブルニットラグ＆丸影＆王冠コイン（`02`）、新ボス `boss_king_v2.glb`＋気絶時 3 星＋ピット暖色照明＋星空夕暮れ（`08`, `08b`）、8 表情ワイプ（`10`、`Sleep`/`Ganbaru` チーク OFF）はすべて大きく改善・正常動作を確認。

### 次セッション（Round 2 と合わせて）で潰すべき細かい粗
1. **`07_rainbow_bridge.png` の撮影位置／北スロープ裏見切れ**：現在ぶう位置 `(-1.6, 1.4, -10.8)` ではカメラが北の木製スロープ裏側に入り、ゲート側面・緑ブロック裏が見切れている。`verify_playthrough.mjs` 側の撮影位置（橋の正面・ゲート前〜橋入口上）を調整し、あわせてスロープ上端・ゲート脚元・橋の繋がり（芝貫通の有無含む）を確認・微調整すること。
2. **`06c_enemies_closeup.png` のスライム＆バルーン近接未収容**：`06c` ではタンク 2 台は綺麗に撮れているが、刷新した `JellySlime`（水滴＋18 気泡）と `PropellerBalloon` のクローズアップが 1 枚に収まっていないため、次セッションで両敵の近接ショットを追加して目視確認する。
3. **`05b_east_cushions.png` の花・草わずかな貫通**：ドミノ手前の隙間にデイジー花 1 本が隣接し、クッション 4 の端に草が少し刺さっている（`WorldPropsManager.ts` / `StylizedGrassField.ts` の除外半径・マスク微調整）。
4. **`02c_diorama_domino_angle.png` のデニム切れ端・橋接続部**：中央左奥テラス交差部にデニム縁の小片がわずかに出ている点、木橋左端とデニム縁のわずかな隙間・接合部の整理。
5. **`01_title.png` 右上空の島・遠景の見え方**：タイトル画面右上に高い足場（バネ＋ゴール島）だけ浮いて見える配置の自然さ見直し。
6. **`09_victory_result.png` 右側プレゼント箱の白飛び**：勝利演出時の `giftBox` の強い光沢反射（粗さまたは加算ライトの強さ）を少し落ち着かせる。

---

## 4. 次セッションの最初の一手（残りロードマップ）
1. **上記 3. の細部 6 点のうち、明らかに直せる見栄え点（`07` カメラ座標・花草除外半径・`giftBox` 反射・スライム近接検品等）を先に軽く整えるか、そのまま Round 2 辛口レビューへ回して合わせて直す**（おすすめは Round 2 をまず回して第三者の視点も合算してから一括修正）。
2. **第三者辛口レビュー Round 2 依頼**：
   - `mcp__workroom__f_start`（別セッション Neon、`wait: true`, `timeoutSec: 600`）または `mcp__workroom__claude_start`（大和田）を使用。
   - 比較対象：`C:\Users\rukat\muse\manmarubuu-action\art-bible\{02,03,07,08,09}*.jpg`、`qa-shots/review_round_1.md`、最新 `qa-shots/*.png` 全枚。
   - 出力先：`C:\Users\rukat\muse\manmarubuu-action\game-web\qa-shots\review_round_2.md`。
3. **修正 → ビルド → `verify_playthrough.mjs` → 全スクショ目視 → Round 3…** のループを回し、**AAA 級「合格」（全観点 85 点以上・P0/P1 ゼロ）** を取得する。
4. 合格後、`npm run dev` を立ち上げて実プレイ可能なローカル URL と最終完了報告を相棒へ届ける。

---

## 5. 主要ファイル・コマンド・バックアップ一覧
- **プロジェクトルート**：`C:\Users\rukat\muse\manmarubuu-action\game-web`
- **起動（相棒テストプレイ用）**：`npm run dev`（終了時はサーバーを落とすこと）
- **ビルド確認**：`npx tsc --noEmit && npm run build`
- **自動プレイ＆17 枚スクショ検品**：`node scripts/verify_playthrough.mjs`（完了時 `taskkill` 同期済み）
- **新ボス 3D 資産一式（Blender 5.2 自作）**：
  - 実機読込先：`public/models/ai/boss_king.glb`（v2 反映済み）
  - 旧版バックアップ：`blender/boss_king_v1_backup.glb`
  - ソース＆編集用：`blender/build_boss_king_v2.py`、`blender/boss_king_v2.blend`、`blender/boss_king_v2.glb`
  - QA 比較レンダー＆検証 JSON：`blender/boss_v2_preview.png`、`blender/boss_v2_motion_qa.png`、`blender/boss_v2_runtime_qa.json`
- **背景・ジオラマ一括生成**：`blender/build_diorama_world_assets.py` / 敵＆小物：`blender/process_and_qa_assets.py`
