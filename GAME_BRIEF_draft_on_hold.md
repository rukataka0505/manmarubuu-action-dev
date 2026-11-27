# F へのブリーフ：まんまるぶう 3D アクションゲーム（全力クオリティ）

大和田より。相棒の依頼だ。会話の原文は `C:\Users\rukat\muse\manmarubuu-action\context-2026-11-18.md`。

## 目的
まんまるぶう（こぶたの国の王子さま、5歳、あかりちゃんの親友。本物のぬいぐるみが元）を主人公にした、**3Dで動きが激しい「ドパガキ系」アクションゲーム**を作る。妥協なしの全力クオリティで頼む。
「ドパガキ系」とは、触った瞬間から気持ちいい作りのこと。具体的には、ヒットストップ、画面の揺れ、派手なパーティクル、コンボ数とダメージ数字のでかい表示、テンポの速さ、ご褒美の連打。
既存ゲームの再現はしない。完全オリジナルで作る。

## 大和田からのたたき台（変えてよい）
- 「まんまる」を手触りにする。ふだんは走ってパンチ。ボタンを押すと丸まって高速で転がり、敵に体当たりしたり、壁で跳ね返ってコンボをつないだりする。つのドリル（HornDrill）は必殺技にする。
- 舞台はこぶたの国。さらわれた国のみんなを助けて、最後にボスと戦う。あかりちゃんは応援役として出す。
- 1プレイは短く、何度でも遊びたくなる長さにする。

## 素材（すべて既存。元ファイルは上書きしない）
- キャラクターの正本：`C:\Users\rukat\manmarubuu-project\models\まんまるぶう_戦闘モーション.blend`
- モーションの説明（全15本、60fps、命中イベントの秒数つき）：`C:\Users\rukat\manmarubuu-project\戦闘モーション_README.md`
- 既存の Unity プロジェクト（Unity 6000.3.25f1 / URP。FBX の書き出しは済んでいる。`MotionLibrary.json` あり）：`C:\Users\rukat\manmarubuu-project\game\`（README.md を読むこと）。FBX は `scripts\export_unity_quality.py` で書き出せる。
- RPG 動画のときの絵の素材と世界観：`C:\Users\rukat\muse\manmarubuu-adventure\`（STORY.md・gen\）
- 画像生成：agy の画像生成は約5時間で14枚まで使える。Codex でも作れる（`manmarubuu-adventure\gen\run_codex_batch.sh`）
- 効果音・BGM：ライセンスに注意すること。Python で自前合成した前例がある（`C:\Users\rukat\muse\manmarubuu-pixel\tools\`）

## 決めてほしいこと
- エンジンは F が決める。既存の Unity のパイプラインを流用するか、ブラウザ（Three.js など）にするか。相棒はスマホからも触れると嬉しいはずなので、その点も考えて選ぶこと。
- 新しい作業は `C:\Users\rukat\muse\manmarubuu-action\` の下で行う。既存の `game\` を直接壊さないこと（フォークやコピーはOK）。

## 完了の条件
- 相棒がすぐに遊べるビルドがある（Windows の exe、またはブラウザで開ける URL・ファイル）
- 60fps で安定して動く。操作の手触りが気持ちいい。BGM と効果音がある
- 最低でも「ステージ1面＋ボス1体」を最後まで遊べる
- `manmarubuu-action\README.md` に、遊び方・構成・素材のクレジットを書く
- 実装の雑務は、渡真利（`mcp__1017__delegate`）や大和田に振ってよい

## 返し方
終わったら、`README.md` に 3〜5 行の要約とパスを書く。そのうえで `mcp__muse__tell` の `done` で知らせること。相棒の判断が要るときは `decision` を使う。
