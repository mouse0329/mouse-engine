const Mouse = {
    canvas: null,
    ctx: null,
    keys: {},
    images: {},
    width: 0,
    height: 0,
    rigidBodies: [],
    debugMode: false,
    uiElements: [],

    // カメラ用チュー
    cameraX: 0,
    cameraY: 0,
    cameraTarget: null,
    cameraSmoothing: 0.1,

    init(canvasId, width, height) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width = width;
        this.height = this.canvas.height = height;

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

    loop(callback) {
        const loopFunc = () => {
            this.updateRigidBodies();
            this.updateCamera(); // カメラ追従チュー
            callback();
            requestAnimationFrame(loopFunc);
        };
        loopFunc();
    },

    updateRigidBodies() {
        const gravity = 0.5;
        for (let body of this.rigidBodies) {
            if (body.isStatic) continue;

            body.vy += gravity;
            body.x += body.vx;
            body.y += body.vy;

            // 地面との当たり判定
            if (body.y + body.height > this.height) {
                body.y = this.height - body.height;
                body.vy = 0;
                body.onGround = true;
            } else {
                body.onGround = false;
            }

            // 壁の当たり判定
            if (body.x < 0) {
                body.x = 0;
                body.vx = 0;
            } else if (body.x + body.width > this.width) {
                body.x = this.width - body.width;
                body.vx = 0;
            }
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
            onGround: false
        };

        this.rigidBodies.push(body);
        return body;
    },

    drawRigidBody(body, color = 'blue') {
        if (body.imageName && this.images[body.imageName]) {
            this.drawImage(body.imageName, body.x, body.y, body.width, body.height);
        } else {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(body.x - this.cameraX, body.y - this.cameraY, body.width, body.height);
        }

        if (this.debugMode) {
            this.ctx.strokeStyle = 'red';
            this.ctx.strokeRect(body.x - this.cameraX, body.y - this.cameraY, body.width, body.height);
            this.drawVertices(body);
        }
    },

    drawVertices(body, pointColor = 'lime', radius = 5) {
        if (!this.debugMode || !body.vertices || body.vertices.length === 0) return;
        this.ctx.fillStyle = pointColor;
        for (let v of body.vertices) {
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
            const uiEl = this.getUIElementAt(pos.x, pos.y);
            if (uiEl && uiEl.onClick) {
                uiEl.onClick(e);
            } else {
                this._onMouseDown(e);
            }
        });

        this.canvas.addEventListener('mouseup', e => {
            const pos = this._getMousePos(e);
            const uiEl = this.getUIElementAt(pos.x, pos.y);
            if (uiEl && uiEl.onRelease) {
                uiEl.onRelease(e);
            } else {
                this._onMouseUp(e);
            }
        });

        this.canvas.addEventListener('mousemove', e => {
            const pos = this._getMousePos(e);
            const uiEl = this.getUIElementAt(pos.x, pos.y);
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
            const x = touch.clientX - rect.left + this.cameraX;
            const y = touch.clientY - rect.top + this.cameraY;
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
            const x = touch.clientX - rect.left + this.cameraX;
            const y = touch.clientY - rect.top + this.cameraY;
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
