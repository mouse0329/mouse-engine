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
        // FPS制御付きループ
        let lastTime = performance.now();
        const frameDuration = 1000 / targetFPS;
        const loopFunc = () => {
            const now = performance.now();
            if (now - lastTime >= frameDuration) {
                lastTime = now;
                this.updateRigidBodies();
                this.updateCamera();
                // --- シーンのupdate/drawを呼ぶ ---
                if (this.currentScene) {
                    if (typeof this.currentScene.update === "function") this.currentScene.update();
                    this.clear();
                    if (typeof this.currentScene.draw === "function") this.currentScene.draw();
                    this.drawUI();
                } else {
                    // 旧来のコールバックもサポート
                    callback && callback();
                }
            }
            requestAnimationFrame(loopFunc);
        };
        loopFunc();
    },

    updateRigidBodies() {
        const gravity = 0.5;

        // 剛体を静的・動的で分割
        const staticBodies = [];
        const dynamicBodies = [];
        for (let body of this.rigidBodies) {
            if (body.isStatic) staticBodies.push(body);
            else dynamicBodies.push(body);
        }

        for (let body of dynamicBodies) {
            body.vy += gravity;
            body.x += body.vx;
            body.y += body.vy;
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
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
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
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
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
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
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
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
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
                    }
                } else {
                    break;
                }
            }

            // 次に動的同士の押し合い
            for (let sep = 0; sep < 1; sep++) {
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
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
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
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
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
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
                            mtv = polygonsMTV(polyA, polyB);
                            hit = !!mtv;
                        } else if (body.collisionType === "polygon" && body.vertices.length >= 3) {
                            const polyA = body.vertices.map(v => ({ x: body.x + v.x, y: body.y + v.y }));
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
                            const polyB = floor.vertices.map(v => ({ x: floor.x + v.x, y: floor.y + v.y }));
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
    },

    createRigidBody(x, y, width, height, vx = 0, vy = 0, imageName = null, useVertices = false, isStatic = false) {
        let vertices = [];

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
            collisionType: useVertices ? "polygon" : "rect" // ← 追加
        };

        this.rigidBodies.push(body);
        return body;
    },

    drawRigidBody(body, color = 'blue') {
        // デバッグモードでなければ頂点描画や輪郭描画を省略
        const ctx = this.ctx;
        if (body.collisionType === "polygon" && body.vertices && body.vertices.length >= 3) {
            ctx.save();
            ctx.beginPath();
            const first = body.vertices[0];
            ctx.moveTo(body.x + first.x - this.cameraX, body.y + first.y - this.cameraY);
            for (let i = 1; i < body.vertices.length; i++) {
                const v = body.vertices[i];
                ctx.lineTo(body.x + v.x - this.cameraX, body.y + v.y - this.cameraY);
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
