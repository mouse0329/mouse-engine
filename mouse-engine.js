const Mouse = {
    canvas: null,
    ctx: null,
    keys: {},
    images: {},
    width: 0,
    height: 0,
    worldWidth: 0, // 追加
    worldHeight: 0, // 追加
    rigidBodies: [],
    debugMode: false,
    uiElements: [],

    // カメラ用チュー
    cameraX: 0,
    cameraY: 0,
    cameraTarget: null,
    cameraSmoothing: 0.1,

    // --- シーン管理用プロパティ ---
    scenes: {},
    currentScene: null,

    init(canvasId, width, height, worldWidth = null, worldHeight = null) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width = width;
        this.height = this.canvas.height = height;
        this.worldWidth = worldWidth || width;
        this.worldHeight = worldHeight || height;

        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => this.keys[e.key] = false);
    },

    loadImage(name, src) {
        const img = new Image();
        img.src = src;
        this.images[name] = img;
    },

    drawImage(name, x, y, w, h) {
        const img = this.images[name];
        if (img && img.complete && img.naturalWidth !== 0) {
            this.ctx.drawImage(img, x - this.cameraX, y - this.cameraY, w, h);
        }
    },

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    },

    isKeyPressed(key) {
        return !!this.keys[key];
    },

    // シーンを登録
    addScene(name, sceneObj) {
        this.scenes[name] = sceneObj;
    },

    // シーンを切り替え
    changeScene(name) {
        if (this.scenes[name]) {
            this.currentScene = this.scenes[name];
            if (typeof this.currentScene.init === "function") {
                this.currentScene.init();
            }
        }
    },

    loop(callback, targetFPS = 60) {
        let lastTime = performance.now();
        const frameDuration = 1000 / targetFPS;

        let frames = 0;
        let fps = 0;
        let fpsLastTime = performance.now();

        const loopFunc = () => {
            const now = performance.now();

            // FPS計測用
            frames++;
            if (now - fpsLastTime >= 1000) { // 1秒経ったら
                fps = frames;
                frames = 0;
                fpsLastTime = now;
                console.log(`FPS: ${fps}`); // ここでFPS表示チュー
            }

            if (now - lastTime >= frameDuration) {
                lastTime = now;
                this.updateRigidBodies();
                this.updateCamera();

                if (this.currentScene) {
                    if (typeof this.currentScene.update === "function") this.currentScene.update();
                    this.clear();
                    if (typeof this.currentScene.draw === "function") this.currentScene.draw();
                    this.drawUI();
                } else {
                    callback && callback();
                }
            }
            requestAnimationFrame(loopFunc);
        };
        loopFunc();
    },


    updateRigidBodies() {
        const gravity = 0.5;

        const staticBodies = [];
        const dynamicBodies = [];
        for (let body of this.rigidBodies) {
            if (body.isStatic) staticBodies.push(body);
            else dynamicBodies.push(body);
        }

        for (let body of dynamicBodies) {
            // --- トリガー剛体は物理演算・衝突解決をスキップ ---
            if (body.isTrigger) {
                for (let other of this.rigidBodies) {
                    if (other === body) continue;

                    // AABB判定（必要なら円形・ポリゴン対応も追加）
                    let hit =
                        body.x < other.x + other.width &&
                        body.x + body.width > other.x &&
                        body.y < other.y + other.height &&
                        body.y + body.height > other.y;

                    if (hit) {
                        if (body.onTrigger) body.onTrigger(other);
                        if (other.isTrigger && other.onTrigger) other.onTrigger(body);
                    }
                }
                continue; // 物理演算はスキップ
            }

            body.vy += gravity;
            body.x += body.vx;
            body.y += body.vy;

            // --- 角度物理演算 ---
            if (body.enableAnglePhysics) {
                body.angularVelocity += body.angularAcceleration;
                body.angle += body.angularVelocity;
                body.angularVelocity *= 0.98; // 減衰
                if (Math.abs(body.angularVelocity) < 0.001) body.angularVelocity = 0;
                body.angularAcceleration = 0;
            }

            body.onGround = false;

            // 静的剛体との衝突のみ判定
            for (let sep = 0; sep < 5; sep++) {
                let minMTV = null;
                let minMTVLen = Infinity;
                let minMTVFloor = null;

                for (let floor of staticBodies) {
                    // --- ここを修正 ---
                    // 静的物体 or 動的物体（自分以外）との衝突を判定
                    if (!floor.isStatic && !body.isStatic) {
                        // 動的同士の衝突
                        let hit = false;
                        let mtv = null;
                        // --- SAT/AABB判定（既存と同じ） ---
                        if (body.collisionType === "polygon" && body.vertices.length >= 3 &&
                            floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = [
                                { x: floor.x, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y + floor.height },
                                { x: floor.x, y: floor.y + floor.height }
                            ];
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = [
                                { x: body.x, y: body.y },
                                { x: body.x + body.width, y: body.y },
                                { x: body.x + body.width, y: body.y + body.height },
                                { x: body.x, y: body.y + body.height }
                            ];
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else {
                            // 通常のAABB
                            hit =
                                body.x < floor.x + floor.width &&
                                body.x + body.width > floor.x &&
                                body.y + body.height > floor.y &&
                                body.y < floor.y + floor.height;
                            if (hit) {
                                // AABB MTV
                                const dx1 = floor.x + floor.width - body.x;
                                const dx2 = body.x + body.width - floor.x;
                                const dy1 = floor.y + floor.height - body.y;
                                const dy2 = body.y + body.height - floor.y;
                                const minX = dx1 < dx2 ? dx1 : -dx2;
                                const minY = dy1 < dy2 ? dy1 : -dy2;
                                if (Math.abs(minX) < Math.abs(minY)) {
                                    mtv = { x: minX, y: 0 };
                                } else {
                                    mtv = { x: 0, y: minY };
                                }
                            }
                        }

                        // 最小MTVを記録
                        if (hit && mtv) {
                            const len = Math.abs(mtv.x) + Math.abs(mtv.y);
                            if (len < minMTVLen) {
                                minMTVLen = len;
                                minMTV = mtv;
                                minMTVFloor = floor;
                            }
                        }
                    } else if (floor.isStatic) {
                        // 静的物体との衝突（既存処理）
                        let hit = false;
                        let mtv = null;

                        // --- SAT判定とMTV計算 ---
                        if (body.collisionType === "polygon" && body.vertices.length >= 3 &&
                            floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = [
                                { x: floor.x, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y + floor.height },
                                { x: floor.x, y: floor.y + floor.height }
                            ];
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = [
                                { x: body.x, y: body.y },
                                { x: body.x + body.width, y: body.y },
                                { x: body.x + body.width, y: body.y + body.height },
                                { x: body.x, y: body.y + body.height }
                            ];
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else {
                            // 通常のAABB
                            hit =
                                body.x < floor.x + floor.width &&
                                body.x + body.width > floor.x &&
                                body.y + body.height > floor.y &&
                                body.y < floor.y + floor.height;
                            if (hit) {
                                // AABB MTV
                                const dx1 = floor.x + floor.width - body.x;
                                const dx2 = body.x + body.width - floor.x;
                                const dy1 = floor.y + floor.height - body.y;
                                const dy2 = body.y + body.height - floor.y;
                                const minX = dx1 < dx2 ? dx1 : -dx2;
                                const minY = dy1 < dy2 ? dy1 : -dy2;
                                if (Math.abs(minX) < Math.abs(minY)) {
                                    mtv = { x: minX, y: 0 };
                                } else {
                                    mtv = { x: 0, y: minY };
                                }
                            }
                        }

                        // 最小MTVを記録
                        if (hit && mtv) {
                            const len = Math.abs(mtv.x) + Math.abs(mtv.y);
                            if (len < minMTVLen) {
                                minMTVLen = len;
                                minMTV = mtv;
                                minMTVFloor = floor;
                            }
                        }
                    }
                }

                // 最小MTVで分離
                if (minMTV) {
                    if (Math.abs(minMTV.x) + Math.abs(minMTV.y) > 0.01) {
                        body.x += minMTV.x;
                        body.y += minMTV.y;
                        // MTV方向への速度成分を除去
                        const mtvLen = Math.hypot(minMTV.x, minMTV.y);
                        if (mtvLen > 0) {
                            const nx = minMTV.x / mtvLen;
                            const ny = minMTV.y / mtvLen;
                            const vDotN = body.vx * nx + body.vy * ny;
                            if (vDotN > 0) {
                                body.vx -= vDotN * nx;
                                body.vy -= vDotN * ny;
                            }
                        }
                        // 上から乗った場合のみonGround
                        if (minMTV.y < -Math.abs(minMTV.x) && body.vy >= 0) {
                            body.vy = 0;
                            body.onGround = true;
                        }
                        // 横からの衝突ならvxを0、vyも微小なら0に
                        if (Math.abs(minMTV.x) < Math.abs(minMTV.y)) {
                            body.vx = 0;
                            if (Math.abs(body.vy) < 1) body.vy = 0;
                        }
                        // 下からの衝突ならvyを0
                        if (minMTV.y > 0.01 && body.vy < 0) {
                            body.vy = 0;
                        }
                        // MTV方向に十分なオフセットで再貫通防止
                        body.x += minMTV.x * 0.1;
                        body.y += minMTV.y * 0.1;

                        // --- ここで角加速度を加える（坂で回転するため） ---
                        if (body.enableAnglePhysics) {
                            // MTVのx成分が大きいほど回転しやすい（簡易モデル）
                            // 右上がり坂で右からぶつかると正、左からぶつかると負
                            // 係数は調整可
                            const torque = minMTV.x * 0.02; // 0.02は回転しやすさ係数
                            body.angularAcceleration += torque / (body.inertia || 1);
                        }
                    }
                } else {
                    break;
                }
            }

            // 次に動的同士の押し合い
            for (let sep = 0; sep < 5; sep++) {
                let minMTV = null;
                let minMTVLen = Infinity;
                let minMTVFloor = null;

                for (let floor of dynamicBodies) {
                    if (floor === body) continue;
                    // --- ここを修正 ---
                    // 静的物体 or 動的物体（自分以外）との衝突を判定
                    if (!floor.isStatic && !body.isStatic) {
                        // 動的同士の衝突
                        let hit = false;
                        let mtv = null;
                        // --- SAT/AABB判定（既存と同じ） ---
                        if (body.collisionType === "polygon" && body.vertices.length >= 3 &&
                            floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = [
                                { x: floor.x, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y + floor.height },
                                { x: floor.x, y: floor.y + floor.height }
                            ];
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = [
                                { x: body.x, y: body.y },
                                { x: body.x + body.width, y: body.y },
                                { x: body.x + body.width, y: body.y + body.height },
                                { x: body.x, y: body.y + body.height }
                            ];
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else {
                            // 通常のAABB
                            hit =
                                body.x < floor.x + floor.width &&
                                body.x + body.width > floor.x &&
                                body.y + body.height > floor.y &&
                                body.y < floor.y + floor.height;
                            if (hit) {
                                // AABB MTV
                                const dx1 = floor.x + floor.width - body.x;
                                const dx2 = body.x + body.width - floor.x;
                                const dy1 = floor.y + floor.height - body.y;
                                const dy2 = body.y + body.height - floor.y;
                                const minX = dx1 < dx2 ? dx1 : -dx2;
                                const minY = dy1 < dy2 ? dy1 : -dy2;
                                if (Math.abs(minX) < Math.abs(minY)) {
                                    mtv = { x: minX, y: 0 };
                                } else {
                                    mtv = { x: 0, y: minY };
                                }
                            }
                        }

                        // 最小MTVを記録
                        if (hit && mtv) {
                            const len = Math.abs(mtv.x) + Math.abs(mtv.y);
                            if (len < minMTVLen) {
                                minMTVLen = len;
                                minMTV = mtv;
                                minMTVFloor = floor;
                            }
                        }
                    } else if (floor.isStatic) {
                        // 静的物体との衝突（既存処理）
                        let hit = false;
                        let mtv = null;

                        // --- SAT判定とMTV計算 ---
                        if (body.collisionType === "polygon" && body.vertices.length >= 3 &&
                            floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = this.getWorldVertices(body);
                            const polyB = [
                                { x: floor.x, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y },
                                { x: floor.x + floor.width, y: floor.y + floor.height },
                                { x: floor.x, y: floor.y + floor.height }
                            ];
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (floor.collisionType === "polygon" && floor.vertices.length >= 3) {
                            const polyA = [
                                { x: body.x, y: body.y },
                                { x: body.x + body.width, y: body.y },
                                { x: body.x + body.width, y: body.y + body.height },
                                { x: body.x, y: body.y + body.height }
                            ];
                            const polyB = this.getWorldVertices(floor);
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else {
                            // 通常のAABB
                            hit =
                                body.x < floor.x + floor.width &&
                                body.x + body.width > floor.x &&
                                body.y + body.height > floor.y &&
                                body.y < floor.y + floor.height;
                            if (hit) {
                                // AABB MTV
                                const dx1 = floor.x + floor.width - body.x;
                                const dx2 = body.x + body.width - floor.x;
                                const dy1 = floor.y + floor.height - body.y;
                                const dy2 = body.y + body.height - floor.y;
                                const minX = dx1 < dx2 ? dx1 : -dx2;
                                const minY = dy1 < dy2 ? dy1 : -dy2;
                                if (Math.abs(minX) < Math.abs(minY)) {
                                    mtv = { x: minX, y: 0 };
                                } else {
                                    mtv = { x: 0, y: minY };
                                }
                            }
                        }

                        // 最小MTVを記録
                        if (hit && mtv) {
                            const len = Math.abs(mtv.x) + Math.abs(mtv.y);
                            if (len < minMTVLen) {
                                minMTVLen = len;
                                minMTV = mtv;
                                minMTVFloor = floor;
                            }
                        }
                    }
                }

                // 最小MTVで分離
                if (minMTV) {
                    if (Math.abs(minMTV.x) + Math.abs(minMTV.y) > 0.01) {
                        // 動的同士のみ半分ずつ押し出す
                        body.x += minMTV.x / 2;
                        body.y += minMTV.y / 2;
                        minMTVFloor.x -= minMTV.x / 2;
                        minMTVFloor.y -= minMTV.y / 2;

                        // 速度も半分ずつ反発
                        const mtvLen = Math.hypot(minMTV.x, minMTV.y);
                        if (mtvLen > 0) {
                            const nx = minMTV.x / mtvLen;
                            const ny = minMTV.y / mtvLen;
                            const vDotN1 = body.vx * nx + body.vy * ny;
                            const vDotN2 = minMTVFloor.vx * nx + minMTVFloor.vy * ny;
                            const avg = (vDotN1 + vDotN2) / 2;
                            body.vx -= (vDotN1 - avg) * nx;
                            body.vy -= (vDotN1 - avg) * ny;
                            minMTVFloor.vx -= (vDotN2 - avg) * nx;
                            minMTVFloor.vy -= (vDotN2 - avg) * ny;
                        }
                    }
                } else {
                    break;
                }
            }

            // 地面との当たり判定（ワールド下端）
            if (body.y + body.height > this.worldHeight) {
                body.y = this.worldHeight - body.height;
                body.vy = 0;
                body.onGround = true;
            }

            // 壁の当たり判定（ワールド端）
            if (body.x < 0) {
                body.x = 0;
                body.vx = 0;
            } else if (body.x + body.width > this.worldWidth) {
                body.x = this.worldWidth - body.width;
                body.vx = 0;
            }

            // 摩擦（地面にいるときのみ適用）
            if (body.onGround) {
                body.vx *= 0.8;
                if (Math.abs(body.vx) < 0.05) body.vx = 0;

                // --- 転がり摩擦: 角速度→vx, vx→角加速度 ---
                if (body.enableAnglePhysics) {
                    // 円剛体の場合は半径を使う
                    let r = body.collisionType === "circle" && body.radius ? body.radius : (body.width * 0.5);
                    // 角速度に応じてvxを加算（転がる動作）
                    body.vx += body.angularVelocity * r;
                    // vxに応じて角加速度を加算（摩擦で回転）
                    body.angularAcceleration += -body.vx / r;
                }
            }
        }

        // --- SAT: 多角形同士の交差判定とMTV計算 ---
        function polygonsMTV(a, b) {
            if (!a || !b || a.length < 3 || b.length < 3) return null;
            let overlap = Infinity;
            let smallestAxis = null;
            let smallestAxisSign = 1;
            const axes = [...getAxes(a), ...getAxes(b)];
            for (const axis of axes) {
                const projA = project(a, axis);
                const projB = project(b, axis);
                const o = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
                if (o <= 0) return null; // 分離軸あり
                if (o < overlap) {
                    overlap = o;
                    smallestAxis = axis;
                    // MTV方向をfloor→bodyに修正
                    const centerA = getCenter(a);
                    const centerB = getCenter(b);
                    const centerAtoB = { x: centerA.x - centerB.x, y: centerA.y - centerB.y };
                    const centerAtoBdotAxis = centerAtoB.x * axis.x + centerAtoB.y * axis.y;
                    smallestAxisSign = (centerAtoBdotAxis < 0) ? -1 : 1;
                }
            }
            return {
                x: smallestAxis.x * overlap * smallestAxisSign,
                y: smallestAxis.y * overlap * smallestAxisSign
            };
        }
        function getAxes(poly) {
            const axes = [];
            for (let i = 0; i < poly.length; i++) {
                const p1 = poly[i];
                const p2 = poly[(i + 1) % poly.length];
                const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
                const normal = { x: -edge.y, y: edge.x };
                const len = Math.hypot(normal.x, normal.y);
                axes.push({ x: normal.x / len, y: normal.y / len });
            }
            return axes;
        }
        function project(poly, axis) {
            let min = Infinity, max = -Infinity;
            for (const p of poly) {
                const proj = p.x * axis.x + p.y * axis.y;
                if (proj < min) min = proj;
                if (proj > max) max = proj;
            }
            return { min, max };
        }
        function getCenter(poly) {
            let x = 0, y = 0;
            for (const p of poly) {
                x += p.x;
                y += p.y;
            }
            return { x: x / poly.length, y: y / poly.length };
        }

        // --- 円と矩形のMTV ---
        function circleRectMTV(circle, rect) {
            // circle: {x, y, radius}, rect: {x, y, width, height}
            const cx = circle.x + circle.radius;
            const cy = circle.y + circle.radius;
            const rx = rect.x, ry = rect.y, rw = rect.width, rh = rect.height;
            const closestX = Math.max(rx, Math.min(cx, rx + rw));
            const closestY = Math.max(ry, Math.min(cy, ry + rh));
            const dx = cx - closestX;
            const dy = cy - closestY;
            const dist = Math.hypot(dx, dy);
            if (dist < circle.radius) {
                const overlap = circle.radius - dist;
                if (dist === 0) return { x: 0, y: -overlap }; // 上に押し出す
                return { x: dx / dist * overlap, y: dy / dist * overlap };
            }
            return null;
        }

        // --- 円と多角形のMTV ---
        function circlePolygonMTV(circle, poly) {
            // circle: {x, y, radius}, poly: [{x, y}, ...]
            const cx = circle.x + circle.radius;
            const cy = circle.y + circle.radius;
            let minOverlap = Infinity;
            let mtv = null;
            // 各辺ごとに最近点を求める
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i];
                const b = poly[(i + 1) % poly.length];
                // 線分ab上の最近点
                const abx = b.x - a.x, aby = b.y - a.y;
                const t = Math.max(0, Math.min(1, ((cx - a.x) * abx + (cy - a.y) * aby) / (abx * abx + aby * aby)));
                const px = a.x + t * abx, py = a.y + t * aby;
                const dx = cx - px, dy = cy - py;
                const dist = Math.hypot(dx, dy);
                if (dist < circle.radius) {
                    const overlap = circle.radius - dist;
                    if (overlap < minOverlap) {
                        minOverlap = overlap;
                        if (dist === 0) {
                            mtv = { x: 0, y: -overlap };
                        } else {
                            mtv = { x: dx / dist * overlap, y: dy / dist * overlap };
                        }
                    }
                }
            }
            // 円中心が多角形内なら最大MTVで外に出す
            let inside = true;
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length];
                if ((b.x - a.x) * (cy - a.y) - (b.y - a.y) * (cx - a.x) < 0) {
                    inside = false;
                    break;
                }
            }
            if (inside) {
                // 多角形の中心方向に押し出す
                const center = getCenter(poly);
                const dx = cx - center.x, dy = cy - center.y;
                const dist = Math.hypot(dx, dy);
                const overlap = circle.radius;
                mtv = { x: dx / dist * overlap, y: dy / dist * overlap };
            }
            return mtv;
        }
    },

    createRigidBody(x, y, width, height, vx = 0, vy = 0, imageName = null, useVertices = false, isStatic = false, options = {}) {
        let vertices = [];
        let radius = options.radius !== undefined ? options.radius : Math.min(width, height) / 2;

        if (useVertices) {
            vertices = [
                { x: 0, y: 0 },
                { x: width, y: 0 },
                { x: width, y: height },
                { x: 0, y: height }
            ];
        }

        const body = {
            x, y, width, height,
            vx, vy,
            vertices,
            imageName,
            isStatic,
            onGround: false,
            collisionType: options.collisionType || (options.radius ? "circle" : (useVertices ? "polygon" : "rect")),
            // 角度物理演算用プロパティ
            angle: options.angle !== undefined ? options.angle : 0,
            angularVelocity: options.angularVelocity !== undefined ? options.angularVelocity : 0,
            angularAcceleration: options.angularAcceleration !== undefined ? options.angularAcceleration : 0,
            inertia: options.inertia !== undefined ? options.inertia : (width * height * 0.1),
            enableAnglePhysics: !!options.enableAnglePhysics,
            radius: options.collisionType === "circle" || options.radius ? radius : undefined,
            isTrigger: !!options.isTrigger, // ★トリガー判定用
            onTrigger: typeof options.onTrigger === "function" ? options.onTrigger : null // ★トリガーコールバック
        };

        this.rigidBodies.push(body);
        return body;
    },

    removeRigidBody(body) {
        const index = this.rigidBodies.indexOf(body);
        if (index !== -1) {
            this.rigidBodies.splice(index, 1);
        }
    },


    // --- 頂点をワールド座標に回転して返す ---
    getWorldVertices(body) {
        if (!body.vertices || body.vertices.length === 0) return [];
        const angle = body.angle || 0;
        const cx = body.width / 2;
        const cy = body.height / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return body.vertices.map(v => ({
            x: body.x + cx + (v.x - cx) * cos - (v.y - cy) * sin,
            y: body.y + cy + (v.x - cx) * sin + (v.y - cy) * cos
        }));
    },

    drawRigidBody(body, color = 'blue') {
        const ctx = this.ctx;
        // --- 円形描画対応 ---
        if (body.collisionType === "circle" && body.radius) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(body.x + body.radius - this.cameraX, body.y + body.radius - this.cameraY, body.radius, 0, Math.PI * 2);
            ctx.closePath();
            if (body.imageName && this.images[body.imageName] && this.images[body.imageName].complete) {
                ctx.save();
                ctx.clip();
                ctx.drawImage(
                    this.images[body.imageName],
                    body.x - this.cameraX,
                    body.y - this.cameraY,
                    body.radius * 2,
                    body.radius * 2
                );
                ctx.restore();
            } else {
                ctx.fillStyle = color;
                ctx.fill();
            }
            if (this.debugMode) {
                ctx.strokeStyle = 'red';
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        // --- 角度物理演算: 回転描画対応 ---
        if (body.angle && body.angle !== 0) {
            ctx.save();
            ctx.translate(body.x + body.width / 2 - this.cameraX, body.y + body.height / 2 - this.cameraY);
            ctx.rotate(body.angle);
            const drawX = -body.width / 2;
            const drawY = -body.height / 2;
            if (body.collisionType === "polygon" && body.vertices && body.vertices.length >= 3) {
                ctx.beginPath();
                const first = body.vertices[0];
                ctx.moveTo(first.x - body.width / 2, first.y - body.height / 2);
                for (let i = 1; i < body.vertices.length; i++) {
                    const v = body.vertices[i];
                    ctx.lineTo(v.x - body.width / 2, v.y - body.height / 2);
                }
                ctx.closePath();

                if (body.imageName && this.images[body.imageName] && this.images[body.imageName].complete) {
                    ctx.save();
                    ctx.clip();
                    if (body.flipX) {
                        ctx.translate(body.width / 2, body.height / 2);
                        ctx.scale(-1, 1);
                        ctx.drawImage(
                            this.images[body.imageName],
                            -body.width / 2,
                            -body.height / 2,
                            body.width,
                            body.height
                        );
                    } else {
                        ctx.drawImage(
                            this.images[body.imageName],
                            drawX,
                            drawY,
                            body.width,
                            body.height
                        );
                    }
                    ctx.restore();
                } else {
                    ctx.fillStyle = color;
                    ctx.fill();
                }

                if (this.debugMode) {
                    ctx.strokeStyle = 'red';
                    ctx.stroke();
                    if (body.vertices && body.vertices.length > 0) {
                        ctx.fillStyle = 'lime';
                        for (let i = 0; i < body.vertices.length; i++) {
                            const v = body.vertices[i];
                            ctx.beginPath();
                            ctx.arc(v.x - body.width / 2, v.y - body.height / 2, 5, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
            } else {
                if (body.imageName && this.images[body.imageName] && this.images[body.imageName].complete) {
                    if (body.flipX) {
                        ctx.save();
                        ctx.translate(body.width / 2, body.height / 2);
                        ctx.scale(-1, 1);
                        ctx.drawImage(
                            this.images[body.imageName],
                            -body.width / 2,
                            -body.height / 2,
                            body.width,
                            body.height
                        );
                        ctx.restore();
                    } else {
                        ctx.drawImage(
                            this.images[body.imageName],
                            drawX,
                            drawY,
                            body.width,
                            body.height
                        );
                    }
                } else {
                    ctx.fillStyle = color;
                    ctx.fillRect(drawX, drawY, body.width, body.height);
                }
                if (this.debugMode) {
                    ctx.strokeStyle = 'red';
                    ctx.strokeRect(drawX, drawY, body.width, body.height);
                }
            }
            ctx.restore();
        } else {
            if (body.collisionType === "polygon" && body.vertices && body.vertices.length >= 3) {
                ctx.save();
                ctx.beginPath();
                const worldVerts = this.getWorldVertices(body);
                const first = worldVerts[0];
                ctx.moveTo(first.x - this.cameraX, first.y - this.cameraY);
                for (let i = 1; i < worldVerts.length; i++) {
                    const v = worldVerts[i];
                    ctx.lineTo(v.x - this.cameraX, v.y - this.cameraY);
                }
                ctx.closePath();

                if (body.imageName && this.images[body.imageName] && this.images[body.imageName].complete) {
                    ctx.save();
                    ctx.clip();
                    if (body.flipX) {
                        ctx.translate(body.x - this.cameraX + body.width / 2, body.y - this.cameraY + body.height / 2);
                        ctx.scale(-1, 1);
                        ctx.drawImage(
                            this.images[body.imageName],
                            -body.width / 2,
                            -body.height / 2,
                            body.width,
                            body.height
                        );
                    } else {
                        ctx.drawImage(
                            this.images[body.imageName],
                            body.x - this.cameraX,
                            body.y - this.cameraY,
                            body.width,
                            body.height
                        );
                    }
                    ctx.restore();
                } else {
                    ctx.fillStyle = color;
                    ctx.fill();
                }

                if (this.debugMode) {
                    ctx.strokeStyle = 'red';
                    ctx.stroke();
                    if (body.vertices && body.vertices.length > 0) {
                        this.drawVertices(body);
                    }
                }
                ctx.restore();
            } else {
                if (body.imageName && this.images[body.imageName] && this.images[body.imageName].complete) {
                    if (body.flipX) {
                        ctx.save();
                        ctx.translate(body.x - this.cameraX + body.width / 2, body.y - this.cameraY + body.height / 2);
                        ctx.scale(-1, 1);
                        ctx.drawImage(
                            this.images[body.imageName],
                            -body.width / 2,
                            -body.height / 2,
                            body.width,
                            body.height
                        );
                        ctx.restore();
                    } else {
                        this.drawImage(body.imageName, body.x, body.y, body.width, body.height);
                    }
                } else {
                    ctx.fillStyle = color;
                    ctx.fillRect(body.x - this.cameraX, body.y - this.cameraY, body.width, body.height);
                }
                if (this.debugMode) {
                    ctx.strokeStyle = 'red';
                    ctx.strokeRect(body.x - this.cameraX, body.y - this.cameraY, body.width, body.height);
                    if (body.vertices && body.vertices.length > 0) {
                        this.drawVertices(body);
                    }
                }
            }
        }
    },

    drawVertices(body, pointColor = 'lime', radius = 5) {
        if (!this.debugMode || !body.vertices || body.vertices.length === 0) return;
        // ループ外でfillStyleをセット
        this.ctx.fillStyle = pointColor;
        for (let i = 0, len = body.vertices.length; i < len; i++) {
            const v = body.vertices[i];
            this.ctx.beginPath();
            this.ctx.arc(body.x + v.x - this.cameraX, body.y + v.y - this.cameraY, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    },

    selectedBody: null,
    selectedVertexIndex: -1,
    mouseDown: false,

    setupVertexEditing() {
        const canvas = this.canvas;
        canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        canvas.addEventListener('mouseup', e => this._onMouseUp(e));
        canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        canvas.addEventListener('dblclick', e => this._onDoubleClick(e));
    },

    _getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left + this.cameraX,
            y: event.clientY - rect.top + this.cameraY
        };
    },

    _onMouseDown(e) {
        const pos = this._getMousePos(e);
        this.mouseDown = true;
        this.selectedBody = null;
        this.selectedVertexIndex = -1;

        for (let body of this.rigidBodies) {
            for (let i = 0; i < body.vertices.length; i++) {
                const v = body.vertices[i];
                const vx = body.x + v.x;
                const vy = body.y + v.y;
                const dist = Math.hypot(pos.x - vx, pos.y - vy);
                if (dist < 10) {
                    this.selectedBody = body;
                    this.selectedVertexIndex = i;
                    return;
                }
            }
        }
    },

    _onMouseUp(e) {
        this.mouseDown = false;
        this.selectedBody = null;
        this.selectedVertexIndex = -1;
    },

    _onMouseMove(e) {
        if (!this.mouseDown || this.selectedBody === null || this.selectedVertexIndex === -1) return;
        const pos = this._getMousePos(e);
        const body = this.selectedBody;
        const i = this.selectedVertexIndex;
        body.vertices[i].x = pos.x - body.x;
        body.vertices[i].y = pos.y - body.y;
    },

    _onDoubleClick(e) {
        const pos = this._getMousePos(e);
        for (let body of this.rigidBodies) {
            if (pos.x >= body.x && pos.x <= body.x + body.width &&
                pos.y >= body.y && pos.y <= body.y + body.height) {
                body.vertices.push({ x: pos.x - body.x, y: pos.y - body.y });
                return;
            }
        }
    },

    addUIElement(element) {
        this.uiElements.push(element);
    },

    drawUI() {
        for (let el of this.uiElements) {
            if (typeof el.draw === 'function') {
                el.draw(this.ctx);
            }
        }
    },

    getUIElementAt(x, y) {
        for (let i = this.uiElements.length - 1; i >= 0; i--) {
            const el = this.uiElements[i];
            if (
                x >= el.x &&
                x <= el.x + el.width &&
                y >= el.y &&
                y <= el.y + el.height
            ) {
                return el;
            }
        }
        return null;
    },

    setupUIEvents() {
        this.canvas.addEventListener('mousedown', e => {
            const pos = this._getMousePos(e);
            // 画面座標に変換
            const screenX = pos.x - this.cameraX;
            const screenY = pos.y - this.cameraY;
            const uiEl = this.getUIElementAt(screenX, screenY);
            if (uiEl && uiEl.onClick) {
                uiEl.onClick(e);
            } else {
                this._onMouseDown(e);
            }
        });

        this.canvas.addEventListener('mouseup', e => {
            const pos = this._getMousePos(e);
            const screenX = pos.x - this.cameraX;
            const screenY = pos.y - this.cameraY;
            const uiEl = this.getUIElementAt(screenX, screenY);
            if (uiEl && uiEl.onRelease) {
                uiEl.onRelease(e);
            } else {
                this._onMouseUp(e);
            }
        });

        this.canvas.addEventListener('mousemove', e => {
            const pos = this._getMousePos(e);
            const screenX = pos.x - this.cameraX;
            const screenY = pos.y - this.cameraY;
            const uiEl = this.getUIElementAt(screenX, screenY);
            if (uiEl && uiEl.onHover) {
                uiEl.onHover(e);
            } else {
                this._onMouseMove(e);
            }
        });

        // タッチ対応チュー
        this.canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const uiEl = this.getUIElementAt(x, y);
            if (uiEl && uiEl.onClick) {
                uiEl.onClick(e);
            } else {
                this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const uiEl = this.getUIElementAt(x, y);
            if (uiEl && uiEl.onHover) {
                uiEl.onHover(e);
            } else {
                this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', e => {
            e.preventDefault();
            this._onMouseUp(e);
        }, { passive: false });
    },

    // カメラ機能チュー！
    followCamera(target) {
        this.cameraTarget = target;
    },

    updateCamera() {
        if (!this.cameraTarget) return;
        const targetX = this.cameraTarget.x + this.cameraTarget.width / 2 - this.width / 2;
        const targetY = this.cameraTarget.y + this.cameraTarget.height / 2 - this.height / 2;
        this.cameraX += (targetX - this.cameraX) * this.cameraSmoothing;
        this.cameraY += (targetY - this.cameraY) * this.cameraSmoothing;
    },

    applyCamera() {
        const cam = this.camera;
        if (!cam.followTarget) return;
        const target = cam.followTarget;

        cam.x = target.x + target.width / 2 - this.width / 2;
        cam.y = target.y + target.height / 2 - this.height / 2;

        // ctx をオフセット
        this.ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
    }
};
// ステージテキスト用クラス
class MouseText {
    constructor(text, x, y, options = {}) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.options = options;
    }
    draw(ctx, cameraX = 0, cameraY = 0) {
        ctx.save();
        ctx.font = this.options.font || "16px sans-serif";
        ctx.fillStyle = this.options.color || "#000";
        ctx.textAlign = this.options.align || "left";
        ctx.textBaseline = this.options.baseline || "top";
        ctx.fillText(this.text, this.x - cameraX, this.y - cameraY);
        ctx.restore();
    }
}

// Mouseオブジェクトの外側に追加（ファイル末尾などに）
Mouse.createSlope = function (x, y, w, h, slope = 1, color = "gray") {
    // slope: 0=水平, 1=右上がり, -1=左上がり
    let vertices;
    if (slope > 0) {
        // 右上がり
        vertices = [
            { x: 0, y: h },
            { x: w, y: 0 },
            { x: w, y: h }
        ];
    } else if (slope < 0) {
        // 左上がり
        vertices = [
            { x: 0, y: 0 },
            { x: w, y: h },
            { x: 0, y: h }
        ];
    } else {
        // 水平
        vertices = [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: h },
            { x: 0, y: h }
        ];
    }
    const body = Mouse.createRigidBody(x, y, w, h, 0, 0, null, true, true);
    body.vertices = vertices;
    body.collisionType = "polygon";
    body.color = color;
    return body;
};

// --- スライダーUIクラス ---
class MouseSlider {
    constructor(x, y, width, min, max, value, options = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = options.height || 24;
        this.min = min;
        this.max = max;
        this.value = value;
        this.onChange = options.onChange || null;
        this.dragging = false;
        this.thumbRadius = options.thumbRadius || 10;
        this.barColor = options.barColor || "#888";
        this.thumbColor = options.thumbColor || "#c00";
        this.bgColor = options.bgColor || "#eee";
        this.label = options.label || "";
    }

    draw(ctx) {
        // バー
        ctx.save();
        ctx.lineWidth = 4;
        ctx.strokeStyle = this.barColor;
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(this.x, this.y + this.height / 2 - 6, this.width, 12);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.height / 2);
        ctx.lineTo(this.x + this.width, this.y + this.height / 2);
        ctx.stroke();

        // サム
        const t = (this.value - this.min) / (this.max - this.min);
        const thumbX = this.x + t * this.width;
        ctx.beginPath();
        ctx.arc(thumbX, this.y + this.height / 2, this.thumbRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.thumbColor;
        ctx.fill();
        ctx.strokeStyle = "#333";
        ctx.stroke();

        // ラベル・値
        ctx.font = "14px sans-serif";
        ctx.fillStyle = "#222";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        if (this.label) {
            ctx.fillText(this.label, this.x, this.y - 2);
        }
        ctx.textAlign = "right";
        ctx.fillText(this.value.toFixed(2), this.x + this.width, this.y - 2);

        ctx.restore();
    }

    // UIイベント用
    onClick(e) {
        this._updateValueFromEvent(e);
        this.dragging = true;
    }
    onRelease(e) {
        this.dragging = false;
    }
    onHover(e) {
        if (this.dragging) {
            this._updateValueFromEvent(e);
        }
    }
    _updateValueFromEvent(e) {
        // e.offsetX/Yが使えない場合はclientXからcanvas座標を計算
        let rect = Mouse.canvas.getBoundingClientRect();
        let x = (e.offsetX !== undefined) ? e.offsetX : (e.clientX - rect.left);
        let relX = Math.max(this.x, Math.min(this.x + this.width, x));
        let t = (relX - this.x) / this.width;
        let newValue = this.min + t * (this.max - this.min);
        this.value = Math.max(this.min, Math.min(this.max, newValue));
        if (this.onChange) this.onChange(this.value);
    }
}

// --- テキスト入力UIクラス ---
class MouseTextInput {
    constructor(x, y, width, options = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = options.height || 32;
        this.value = options.value || "";
        this.placeholder = options.placeholder || "";
        this.onChange = options.onChange || null;

        this.focused = false;
        this.maxLength = options.maxLength || 64;
        this.font = options.font || "18px sans-serif";
        this.bgColor = options.bgColor || "#fff";
        this.borderColor = options.borderColor || "#888";
        this.textColor = options.textColor || "#222";
        this.placeholderColor = options.placeholderColor || "#aaa";
        this.cursorColor = options.cursorColor || "#222";

        this._cursorVisible = true;
        this._lastBlink = Date.now();
        this.scrollOffset = 0;

        // 実際のテキスト入力用の隠しinputを作るチュー
        this._createHiddenInput();
    }

    _createHiddenInput() {
        this.hiddenInput = document.createElement("input");
        this.hiddenInput.type = "text";
        this.hiddenInput.style.position = "absolute";
        this.hiddenInput.style.opacity = "0";  // 完全に見えなくするチュー
        this.hiddenInput.style.left = `${this.x}px`;
        this.hiddenInput.style.top = `${this.y}px`;
        this.hiddenInput.style.width = `${this.width}px`;
        this.hiddenInput.style.height = `${this.height}px`;
        this.hiddenInput.maxLength = this.maxLength;
        this.hiddenInput.autocomplete = "off";
        this.hiddenInput.spellcheck = false;
        document.body.appendChild(this.hiddenInput);

        // inputイベントで値を同期
        this.hiddenInput.addEventListener("input", (e) => {
            this.value = this.hiddenInput.value;
            if (this.onChange) this.onChange(this.value);
        });

        // blur時にフォーカス外す
        this.hiddenInput.addEventListener("blur", (e) => {
            this.focused = false;
        });
    }

    draw(ctx) {
        ctx.save();
        // 背景
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // 枠線
        ctx.strokeStyle = this.focused ? "#0af" : this.borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        ctx.font = this.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        // テキスト幅とスクロール計算
        const textWidth = ctx.measureText(this.value).width;
        const availableWidth = this.width - 16; // 余白

        if (textWidth > availableWidth) {
            this.scrollOffset = textWidth - availableWidth;
        } else {
            this.scrollOffset = 0;
        }

        // クリップしてスクロール対応
        ctx.save();
        ctx.beginPath();
        ctx.rect(this.x + 8, this.y + 4, availableWidth, this.height - 8);
        ctx.clip();

        // テキスト or プレースホルダー
        ctx.fillStyle = this.value ? this.textColor : this.placeholderColor;
        const textToDraw = this.value || this.placeholder;
        ctx.fillText(textToDraw, this.x + 8 - this.scrollOffset, this.y + this.height / 2);

        ctx.restore();

        // カーソル点滅（フォーカス時のみ）
        if (this.focused) {
            const now = Date.now();
            if (now - this._lastBlink > 500) {
                this._cursorVisible = !this._cursorVisible;
                this._lastBlink = now;
            }
            if (this._cursorVisible) {
                ctx.beginPath();
                ctx.strokeStyle = this.cursorColor;
                ctx.moveTo(this.x + 8 + textWidth - this.scrollOffset, this.y + 6);
                ctx.lineTo(this.x + 8 + textWidth - this.scrollOffset, this.y + this.height - 6);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    onClick(e) {
        // クリック判定
        if (
            e.offsetX >= this.x && e.offsetX <= this.x + this.width &&
            e.offsetY >= this.y && e.offsetY <= this.y + this.height
        ) {
            this.focused = true;

            // 他の入力欄のフォーカス解除
            for (const el of Mouse.uiElements) {
                if (el !== this && el instanceof MouseTextInput) el.focused = false;
            }

            // hiddenInputにフォーカスを移すチュー
            this.hiddenInput.focus();

            // hiddenInputの位置も更新（必要に応じて）
            this.hiddenInput.style.left = `${this.x}px`;
            this.hiddenInput.style.top = `${this.y}px`;
        } else {
            this.focused = false;
            this.hiddenInput.blur();
        }
    }
}


// --- テキスト入力欄のキーボードイベントをグローバルで処理 ---
window.addEventListener("keydown", function (e) {
    for (const el of Mouse.uiElements) {
        if (el instanceof MouseTextInput && el.focused) {
            el.handleKey(e);
            break;
        }
    }
});
