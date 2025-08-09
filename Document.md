# **Mouse Engine ドキュメント**

mouse-engine.jsは、HTML5 Canvas APIを利用して2Dゲームを開発するための、軽量かつ多機能な物理エンジンおよびゲームフレームワークです。


## **1. エンジンの初期化とコア設定**

Mouse グローバルオブジェクトは、エンジンの全ての機能を提供します。


### **Mouse.init(canvasId, width, height, worldWidth = null, worldHeight = null)**

ゲームエンジンの**初期化**を行います。キャンバスの設定、描画コンテキストの取得、キーボードイベントリスナーの登録など、基本的なセットアップを担います。



* **canvasId**: 使用するHTMLの&lt;canvas>要素のid属性（例: "gameCanvas"）。
* **width**: キャンバスの表示幅（ピクセル単位）。
* **height**: キャンバスの表示高さ（ピクセル単位）。
* **worldWidth** (オプション): ゲームワールド全体の論理的な幅。指定しない場合、キャンバスの幅がワールド幅となります。
* **worldHeight** (オプション): ゲームワールド全体の論理的な高さ。指定しない場合、キャンバスの高さがワールド高さとなります。

**例**:

Mouse.init('myGameCanvas', 800, 600, 2000, 1500); // 800x600のキャンバスで2000x1500のワールドを設定 \



## **2. ゲームループとシーン管理**

ゲームの進行と状態遷移を制御するメカニズムです。


### **Mouse.loop(callback, targetFPS = 60)**

ゲームのメインループを**開始**します。このループは、フレームレートを制御しながら、ゲームの更新と描画を繰り返し行います。



* **callback** (非推奨): シーン機能を使用しない場合の、毎フレーム実行される更新・描画関数です。新しいプロジェクトではシーン機能の使用が推奨されます。
* **targetFPS** (オプション): 目標とするフレームレート。デフォルトは 60 FPSです。

**注意**: シーンが設定されている場合 (Mouse.currentScene がnullでない場合)、callbackは呼び出されず、現在のシーンのupdateおよびdrawメソッドが代わりに呼び出されます。


### **Mouse.addScene(name, sceneObj)**

**新しいゲームシーンを登録**します。シーンは、特定のゲームの状態（例: タイトル画面、レベル1、ゲームオーバー画面など）をカプセル化するために使用されます。



* **name**: シーンを一意に識別するための文字列（例: "titleScreen", "level1"）。
* **sceneObj**: 以下のメソッドを持つオブジェクトです。
    * **init()**: シーンが開始されるときに一度だけ呼び出されます（初期化、アセットロードなど）。
    * **update()**: 毎フレーム呼び出され、ゲームロジックの更新（キャラクター移動、物理演算など）を行います。
    * **draw()**: 毎フレーム呼び出され、ゲーム要素の描画を行います。

**例**:

const TitleScene = { \
    init: function() { console.log('タイトルシーンが初期化されました！'); }, \
    update: function() { /* ... */ }, \
    draw: function() { /* ... */ } \
}; \
Mouse.addScene('title', TitleScene); \



### **Mouse.changeScene(name)**

**現在実行中のシーンを切り替えます**。指定された名前のシーンが存在しない場合、何も起こりません。



* **name**: 切り替えたいシーンの登録名。

**例**:

Mouse.changeScene('level1'); \



## **3. 物理エンジンと衝突判定**

ゲームオブジェクトの動きと相互作用をシミュレートするための**剛体物理演算**を提供します。


### **Mouse.createRigidBody(x, y, width, height, vx = 0, vy = 0, imageName = null, useVertices = false, isStatic = false, options = {})**

**新しい剛体**（物理演算の対象となるオブジェクト）を作成し、エンジンに追加します。



* **x**, **y**: 剛体の初期位置（ワールド座標）。
* **width**, **height**: 剛体の寸法。
* **vx** (オプション): 初期水平速度。デフォルトは0。
* **vy** (オプション): 初期垂直速度。デフォルトは0。
* **imageName** (オプション): この剛体を描画する際に使用する、事前にロードされた画像のキー名。
* **useVertices** (オプション): trueに設定すると、デフォルトで矩形の頂点を持つ多角形として扱われます。これにより、SATを用いた多角形衝突判定が可能になります。
* **isStatic** (オプション): trueに設定すると、剛体は物理演算の影響を受けず、固定されたオブジェクトとして扱われます（例: 地面、壁）。デフォルトはfalse（動的剛体）。
* **options** (オプション): 剛体の詳細設定を含むオブジェクトです。
    * **collisionType**: 剛体の衝突形状を指定します。
        * "rect" (デフォルト): 矩形衝突（AABB）。
        * "circle": 円形衝突。radiusプロパティが必須です。
        * "polygon": 多角形衝突（SAT）。useVerticesをtrueにするか、verticesプロパティを直接設定します。
    * **radius**: collisionTypeが"circle"の場合に必須。円の半径。
    * **vertices**: collisionTypeが"polygon"の場合、剛体に対する相対座標での頂点配列。useVerticesがtrueの場合、デフォルトの矩形頂点が設定されます。
    * **enableAnglePhysics**: trueに設定すると、剛体は回転物理演算（角速度、角加速度、慣性）の影響を受けます。
    * **angle**: 初期角度（ラジアン）。
    * **angularVelocity**: 初期角速度。
    * **angularAcceleration**: 初期角加速度。
    * **inertia**: 剛体の慣性。回転のしやすさに影響します。デフォルトはwidth * height * 0.1。
    * **isTrigger**: trueに設定すると、この剛体は他の剛体との衝突解決を行わず、単に重なりを検知する「トリガー」として機能します。
    * **onTrigger**: isTriggerがtrueの場合、この関数がトリガーが他の剛体と重なったときに呼び出されます。引数として重なった相手の剛体を受け取ります。

**例**:

// 動く四角い剛体 \
const player = Mouse.createRigidBody(100, 100, 50, 50, 0, 0, 'playerImage', true, false, { \
    enableAnglePhysics: true, // 回転を有効化 \
    inertia: 500 // 慣性を設定 \
}); \
 \
// 固定された地面（多角形） \
const ground = Mouse.createRigidBody(0, 500, 800, 50, 0, 0, null, true, true, { \
    vertices: [ {x:0, y:0}, {x:800, y:0}, {x:800, y:50}, {x:0, y:50} ] \
}); \
 \
// トリガー領域 \
const goalTrigger = Mouse.createRigidBody(700, 400, 50, 50, 0, 0, null, false, true, { \
    isTrigger: true, \
    onTrigger: (otherBody) => { \
        if (otherBody === player) { \
            console.log('ゴールに到達しました！'); \
            // ゲームクリア処理など \
        } \
    } \
}); \



### **Mouse.createSlope(x, y, w, h, slope = 1, color = "gray")**

**坂道**として機能する静的な多角形剛体を簡単に作成するためのヘルパー関数です。



* **x**, **y**: 坂道の左上のワールド座標。
* **w**, **h**: 坂道の幅と高さ。
* **slope** (オプション): 坂道の向きと形状を決定します。
    * 1 (デフォルト): 右上がりの坂道。
    * -1: 左上がりの坂道。
    * 0: 水平な長方形（通常の床）。
* **color** (オプション): 坂道の描画色。デフォルトは"gray"。

**例**:

const rightSlope = Mouse.createSlope(300, 450, 100, 50, 1, "green"); // 右上がりの坂 \
const leftSlope = Mouse.createSlope(500, 450, 100, 50, -1, "blue");  // 左上がりの坂 \



## **4. 描画とアセット管理**

ゲーム内の視覚要素を制御します。


### **Mouse.loadImage(name, src)**

**画像をロード**して、後で描画するためにエンジンに登録します。



* **name**: 画像を識別するためのキー名（例: "playerImage", "background"）。
* **src**: 画像ファイルのパス（例: "./assets/player.png"）。

**例**:

Mouse.loadImage('playerImage', 'images/player.png'); \
Mouse.loadImage('coinImage', 'images/coin.png'); \



### **Mouse.drawImage(name, x, y, w, h)**

ロード済みの**画像を描画**します。画像はカメラの位置に基づいてオフセットされます。



* **name**: ロード済みの画像のキー名。
* **x**, **y**: 画像の描画位置（ワールド座標）。
* **w**, **h**: 画像の描画幅と高さ。

**例**:

Mouse.drawImage('background', 0, 0, Mouse.worldWidth, Mouse.worldHeight); \



### **Mouse.drawRigidBody(body, color = 'blue')**

剛体オブジェクトを**描画**します。剛体のcollisionType（矩形、円、多角形）やimageNameプロパティに応じて適切な描画を行います。デバッグモード (Mouse.debugMode = true) の場合、衝突形状を示す赤いアウトラインが表示されます。



* **body**: createRigidBodyで作成された剛体オブジェクト。
* **color** (オプション): imageNameが指定されていない場合に剛体を塗りつぶす色。デフォルトは"blue"。

**例**:

// シーンのdrawメソッド内で \
Mouse.drawRigidBody(player, 'red'); \
Mouse.drawRigidBody(ground, 'brown'); \



## **5. カメラシステム**

広大なゲームワールドをスクロールして表示するための**カメラ機能**を提供します。


### **Mouse.followCamera(target)**

カメラが**特定の剛体を追跡**するように設定します。カメラはターゲット剛体の中心に追従し、スムーズな動きのためにcameraSmoothingが適用されます。



* **target**: カメラが追跡する剛体オブジェクト。

**例**:

Mouse.followCamera(player); // プレイヤー剛体をカメラが追跡 \



## **6. UIコンポーネント**

ゲーム内のインタラクティブなユーザーインターフェース要素を作成するためのクラスです。


### **MouseText クラス**

**キャンバス上にテキストを表示**するためのシンプルなクラスです。



* **コンストラクタ**: new MouseText(text, x, y, options = {})
    * text: 表示する文字列。
    * x, y: テキストの表示位置。
    * options:
        * font: フォントスタイル（例: "20px Arial"）。
        * color: テキストの色。
        * align: 水平アライメント（"left", "center", "right"）。
        * baseline: 垂直アライメント（"top", "middle", "bottom"）。
* **draw(ctx, cameraX = 0, cameraY = 0)**: テキストを描画します。

**例**:

const gameTitle = new MouseText("僕のすごいゲーム", 100, 50, { font: "36px sans-serif", color: "#333" }); \
Mouse.addUIElement(gameTitle); \



### **MouseSlider クラス**

ユーザーが数値を調整できる**スライダーUI**を提供します。



* **コンストラクタ**: new MouseSlider(x, y, width, min, max, value, options = {})
    * x, y, width: スライダーの位置と幅。
    * min, max: スライダーの最小値と最大値。
    * value: 初期値。
    * options:
        * height: スライダーの高さ。
        * onChange: 値が変更されたときに呼び出されるコールバック関数。引数として新しい値を受け取ります。
        * thumbRadius: スライダーのつまみの半径。
        * barColor, thumbColor, bgColor: 各部分の色。
        * label: スライダーの上に表示されるラベル文字列。
* **draw(ctx)**: スライダーを描画します。
* **イベントハンドラ**: onClick, onRelease, onHover が内部で処理されます。

**例**:

const volumeSlider = new MouseSlider(50, 100, 200, 0, 100, 50, { \
    label: "音量", \
    onChange: (newValue) => { \
        console.log("音量: " + newValue.toFixed(2)); \
    } \
}); \
Mouse.addUIElement(volumeSlider); \



### **MouseTextInput クラス**

ユーザーがテキストを入力できる**入力欄UI**を提供します。



* **コンストラクタ**: new MouseTextInput(x, y, width, options = {})
    * x, y, width: 入力欄の位置と幅。
    * options:
        * height: 入力欄の高さ。
        * value: 初期テキスト。
        * placeholder: プレースホルダーテキスト。
        * onChange: テキストが変更されるたびに呼び出されるコールバック関数。引数として現在のテキストを受け取ります。
        * maxLength: 最大入力文字数。
        * font, bgColor, borderColor, textColor, placeholderColor, cursorColor: 各部分のスタイル。
* **draw(ctx)**: 入力欄を描画します。フォーカスされている場合、点滅するカーソルが表示されます。
* **イベントハンドラ**: onClick, onRelease, onHover, handleKey が内部で処理され、キーボード入力を受け付けます。

**例**:

const playerNameInput = new MouseTextInput(50, 150, 250, { \
    placeholder: "プレイヤー名を入力", \
    onChange: (text) => { \
        console.log("入力された名前: " + text); \
    } \
}); \
Mouse.addUIElement(playerNameInput); \



### **Mouse.addUIElement(element)**

MouseSliderやMouseTextInputなどの**UI要素をエンジンに登録**します。登録されたUI要素は、Mouse.drawUI()によって自動的に描画され、Mouse.setupUIEvents()によってマウス/タッチイベントが処理されます。



* **element**: draw()メソッドと、必要に応じてonClick()、onRelease()、onHover()メソッドを持つUIオブジェクト。


## **7. デバッグ機能**


### **Mouse.debugMode = true/false**

trueに設定すると、剛体の描画時に**赤い衝突形状のアウトライン**が表示され、デバッグに役立ちます。


## **8. イベント処理**


### **Mouse.isKeyPressed(key)**

指定されたキーが**現在押されているか**どうかを返します。



* **key**: キーの文字列表現（例: "ArrowLeft", "Space", "a"）。

**例**:

if (Mouse.isKeyPressed('ArrowRight')) { \
    player.vx = 5; \
} \



### **Mouse.setupUIEvents()**

UI要素に対する**マウスおよびタッチイベントリスナーを設定**します。このメソッドは、UI要素が正しくインタラクトするために必要です。通常、エンジンの初期化後、またはゲーム開始時に一度呼び出されます。

**注意**: この関数はmouse-engine.jsファイルの末尾で自動的に呼び出されるwindow.addEventListener("keydown", ...)や、Mouse.init()内でのマウス/タッチイベント設定と連携して動作します。


## **付録: SAT（分離軸定理）とMTV（最小移動ベクトル）**

mouse-engine.jsの物理エンジンは、多角形同士の衝突判定に**分離軸定理 (Separating Axis Theorem - SAT)** を使用しています。



* **SAT**: 2つの凸多角形が交差しているかどうかを判断する効率的な方法です。両方の多角形が全ての「分離軸」（多角形の各辺に垂直な軸）上に投影されたときに、その投影が互いに重なり合っている場合、それらの多角形は衝突していると判断されます。もし一つでも重ならない軸が見つかれば、衝突していない（分離している）と判断されます。
* **MTV**: 衝突が検出された場合、MTV (Minimum Translation Vector) は、2つの剛体が互いに重なり合わないようにするために、剛体を移動させる必要がある最小のベクトルです。このベクトルは、衝突解決のために剛体を「押し出す」ために使用されます。

このSATとMTVの実装により、矩形だけでなく、より複雑な形状の多角形剛体間でも正確な衝突検出と解決が可能になっています。また、円と矩形、円と多角形の衝突判定ロジックも組み込まれています。
