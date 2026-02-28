/* ============================================================
   BDD의 지뢰찾기 — game.js
   Firebase Firestore 실시간 동기화 스코어보드
   Firebase 미설정 시 → localStorage 폴백 자동 전환
   ============================================================ */

'use strict';

// ══════════════════════════════════════════════════════════════
//  🔧 FIREBASE 설정 (README.md 참고하여 값 입력)
//     미입력 시 localStorage 로컬 저장으로 자동 전환됩니다.
// ══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
// ══════════════════════════════════════════════════════════════

// ── 상수 ─────────────────────────────────────────────────────
const ROWS = 15;
const COLS = 15;
const MINES = 40;
const SCORES_COLLECTION = 'minesweeper_scores';
const LOCAL_KEY = 'minesweeper_scores_bdd_v1';
const MAX_SCORES = 20;

// ── DOM 참조 ─────────────────────────────────────────────────
const boardEl = document.getElementById('board');
const faceImg = document.getElementById('face-img');
const resetBtn = document.getElementById('reset-btn');
const mineCountEl = document.getElementById('mine-count-display');
const timerEl = document.getElementById('timer-display');
const playerTagName = document.getElementById('player-tag-name');
const syncStatus = document.getElementById('sync-status');

const nicknameModal = document.getElementById('nickname-modal');
const nicknameInput = document.getElementById('nickname-input');
const startGameBtn = document.getElementById('start-game-btn');

const winModal = document.getElementById('win-modal');
const winTimeDisplay = document.getElementById('win-time-display');
const saveScoreBtn = document.getElementById('save-score-btn');
const winSkipBtn = document.getElementById('win-skip-btn');

const loseModal = document.getElementById('lose-modal');
const loseRetryBtn = document.getElementById('lose-retry-btn');

const scoreboardBody = document.getElementById('scoreboard-body');
const scoreboardEmpty = document.getElementById('scoreboard-empty');

// ── Firebase 초기화 ───────────────────────────────────────────
let db = null;
let isFirebaseReady = false;

function isPlaceholderConfig(cfg) {
    return !cfg.apiKey || cfg.apiKey.startsWith('YOUR_') || cfg.projectId.startsWith('YOUR_');
}

function initFirebase() {
    if (isPlaceholderConfig(FIREBASE_CONFIG)) {
        console.warn('[지뢰찾기] Firebase 설정이 없습니다. 로컬 저장(localStorage)을 사용합니다.\n'
            + 'README.md를 참고하여 FIREBASE_CONFIG를 입력하면 전 세계 실시간 동기화가 활성화됩니다.');
        setSyncStatus('local');
        return false;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        db = firebase.firestore();
        isFirebaseReady = true;
        setSyncStatus('online');
        return true;
    } catch (e) {
        console.error('[지뢰찾기] Firebase 초기화 실패:', e);
        setSyncStatus('error');
        return false;
    }
}

function setSyncStatus(state) {
    const map = {
        online: { text: '🌐 실시간 동기화 중', color: '#34c759' },
        local: { text: '💾 로컬 저장 모드', color: '#ffcc00' },
        error: { text: '⚠️ 연결 오류', color: '#ff3b30' },
    };
    const s = map[state] || map.local;
    syncStatus.textContent = s.text;
    syncStatus.style.color = s.color;
}

// ── 게임 상태 ─────────────────────────────────────────────────
let board = [];
let cellEls = [];
let mineSet = new Set();
let flagCount = 0;
let revealCount = 0;
let gameActive = false;
let gameStarted = false;
let timerValue = 0;
let timerInterval = null;
let finalTime = 0;
let currentNick = '';
let unsubscribeScoreboard = null;  // Firestore 리스너 해제용

// ── 닉네임 모달 ───────────────────────────────────────────────
function openNicknameModal() {
    nicknameInput.value = '';
    nicknameInput.style.outline = '';
    nicknameInput.placeholder = '닉네임 입력...';
    openModal(nicknameModal);
    setTimeout(() => nicknameInput.focus(), 120);
}

startGameBtn.addEventListener('click', () => {
    const nick = nicknameInput.value.trim();
    if (!nick) {
        nicknameInput.style.outline = '2px solid red';
        nicknameInput.placeholder = '닉네임을 입력해주세요!';
        return;
    }
    currentNick = nick;
    playerTagName.textContent = nick;
    closeModal(nicknameModal);
    initGame();
});

nicknameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') startGameBtn.click();
});

// ── 초기화 ───────────────────────────────────────────────────
function initGame() {
    board = [];
    cellEls = [];
    mineSet = new Set();
    flagCount = 0;
    revealCount = 0;
    gameActive = true;
    gameStarted = false;

    stopTimer();
    timerValue = 0;
    updateTimerDisplay();
    updateMineCountDisplay();
    faceImg.src = 'imgs/main.png';

    closeModal(winModal);
    closeModal(loseModal);

    renderBoard();
}

// ── 보드 렌더링 ───────────────────────────────────────────────
function renderBoard() {
    boardEl.innerHTML = '';
    cellEls = [];
    for (let r = 0; r < ROWS; r++) {
        board.push([]);
        cellEls.push([]);
        for (let c = 0; c < COLS; c++) {
            board[r].push({ mine: false, revealed: false, flagged: false, adj: 0 });
            const div = document.createElement('div');
            div.className = 'cell';
            div.dataset.r = r;
            div.dataset.c = c;
            div.addEventListener('click', onCellClick);
            div.addEventListener('contextmenu', onCellRightClick);
            boardEl.appendChild(div);
            cellEls[r].push(div);
        }
    }
}

// ── 지뢰 배치 (첫 클릭 후 — 안전 영역 보장) ──────────────────
function placeMines(safeR, safeC) {
    const safe = new Set();
    for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
            const nr = safeR + dr, nc = safeC + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) safe.add(`${nr},${nc}`);
        }

    while (mineSet.size < MINES) {
        const r = Math.floor(Math.random() * ROWS);
        const c = Math.floor(Math.random() * COLS);
        const k = `${r},${c}`;
        if (!safe.has(k) && !mineSet.has(k)) { mineSet.add(k); board[r][c].mine = true; }
    }

    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            if (!board[r][c].mine) board[r][c].adj = countAdjMines(r, c);
}

function countAdjMines(r, c) {
    let n = 0;
    for (const [dr, dc] of nb())
        if (inBounds(r + dr, c + dc) && board[r + dr][c + dc].mine) n++;
    return n;
}

function nb() { return [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]; }
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

// ── 셀 클릭 ──────────────────────────────────────────────────
function onCellClick(e) {
    if (!gameActive) return;
    const r = +e.currentTarget.dataset.r, c = +e.currentTarget.dataset.c;
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) return;

    if (!gameStarted) { gameStarted = true; placeMines(r, c); startTimer(); }

    if (cell.mine) { triggerGameOver(r, c); return; }
    revealCell(r, c);
    checkWin();
}

// ── 우클릭 (깃발) ─────────────────────────────────────────────
function onCellRightClick(e) {
    e.preventDefault();
    if (!gameActive) return;
    const r = +e.currentTarget.dataset.r, c = +e.currentTarget.dataset.c;
    const cell = board[r][c];
    if (cell.revealed) return;

    if (cell.flagged) {
        cell.flagged = false; flagCount--;
        cellEls[r][c].classList.remove('flagged');
        cellEls[r][c].innerHTML = '';
    } else {
        cell.flagged = true; flagCount++;
        const img = document.createElement('img');
        img.src = 'imgs/flag.png'; img.alt = '깃발'; img.draggable = false;
        cellEls[r][c].classList.add('flagged');
        cellEls[r][c].innerHTML = '';
        cellEls[r][c].appendChild(img);
    }
    updateMineCountDisplay();
}

// ── 플러드 필 공개 ────────────────────────────────────────────
function revealCell(r, c) {
    if (!inBounds(r, c)) return;
    const cell = board[r][c];
    if (cell.revealed || cell.flagged || cell.mine) return;
    cell.revealed = true; revealCount++;

    const el = cellEls[r][c];
    el.classList.add('revealed'); el.classList.remove('flagged');

    if (cell.adj > 0) { el.textContent = cell.adj; el.dataset.num = cell.adj; }
    else { for (const [dr, dc] of nb()) revealCell(r + dr, c + dc); }
}

// ── 게임 오버 ─────────────────────────────────────────────────
function triggerGameOver(hitR, hitC) {
    gameActive = false; stopTimer();
    faceImg.src = 'imgs/died.png';

    const el = cellEls[hitR][hitC];
    el.classList.add('revealed', 'mine-revealed', 'exploded');
    addBombImg(el);

    for (const key of mineSet) {
        const [mr, mc] = key.split(',').map(Number);
        if (mr === hitR && mc === hitC) continue;
        if (!board[mr][mc].flagged) {
            cellEls[mr][mc].classList.add('revealed', 'mine-revealed');
            cellEls[mr][mc].innerHTML = '';
            addBombImg(cellEls[mr][mc]);
        }
    }
    setTimeout(() => openModal(loseModal), 600);
}

function addBombImg(el) {
    const img = document.createElement('img');
    img.src = 'imgs/bomb.png'; img.alt = '지뢰'; img.draggable = false;
    el.appendChild(img);
}

// ── 승리 확인 ─────────────────────────────────────────────────
function checkWin() {
    if (revealCount >= ROWS * COLS - MINES) {
        gameActive = false; stopTimer();
        finalTime = timerValue;
        winTimeDisplay.textContent = finalTime;
        setTimeout(() => openModal(winModal), 300);
    }
}

// ── 타이머 ────────────────────────────────────────────────────
function startTimer() {
    timerInterval = setInterval(() => {
        timerValue = Math.min(timerValue + 1, 999);
        updateTimerDisplay();
    }, 1000);
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; }
function updateTimerDisplay() { timerEl.textContent = String(timerValue).padStart(3, '0'); }
function updateMineCountDisplay() {
    const rem = Math.max(-99, Math.min(999, MINES - flagCount));
    mineCountEl.textContent = rem < 0
        ? '-' + String(Math.abs(rem)).padStart(2, '0')
        : String(rem).padStart(3, '0');
}

// ── 모달 ──────────────────────────────────────────────────────
function openModal(m) { m.classList.add('active'); }
function closeModal(m) { m.classList.remove('active'); }

// ══════════════════════════════════════════════════════════════
//  스코어보드 — Firebase Firestore (실시간) / localStorage (폴백)
// ══════════════════════════════════════════════════════════════

// ── [Firestore] 점수 저장 ─────────────────────────────────────
async function addScoreFirestore(name, time) {
    try {
        await db.collection(SCORES_COLLECTION).add({
            name,
            time,
            date: new Date().toLocaleDateString('ko-KR'),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error('[지뢰찾기] 점수 저장 실패:', e);
        // 폴백: localStorage에도 저장
        addScoreLocal(name, time);
    }
}

// ── [Firestore] 실시간 리스너 ─────────────────────────────────
function subscribeScoreboard() {
    if (unsubscribeScoreboard) unsubscribeScoreboard(); // 기존 리스너 해제

    unsubscribeScoreboard = db
        .collection(SCORES_COLLECTION)
        .orderBy('time', 'asc')
        .limit(MAX_SCORES)
        .onSnapshot(snapshot => {
            const scores = snapshot.docs.map(doc => doc.data());
            renderScoreboardRows(scores);
        }, err => {
            console.error('[지뢰찾기] 스코어보드 구독 오류:', err);
            setSyncStatus('error');
            // 폴백: localStorage
            renderScoreboardRows(loadScoresLocal());
        });
}

// ── [Local] 점수 저장/불러오기 ────────────────────────────────
function loadScoresLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; }
    catch { return []; }
}
function saveScoresLocal(s) { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); }
function addScoreLocal(name, time) {
    const s = loadScoresLocal();
    s.push({ name, time, date: new Date().toLocaleDateString('ko-KR') });
    s.sort((a, b) => a.time - b.time);
    if (s.length > MAX_SCORES) s.splice(MAX_SCORES);
    saveScoresLocal(s);
    renderScoreboardRows(s);
}

// ── 스코어보드 렌더링 (공통) ──────────────────────────────────
function renderScoreboardRows(scores) {
    scoreboardBody.innerHTML = '';
    if (!scores || scores.length === 0) {
        scoreboardEmpty.classList.add('visible');
        return;
    }
    scoreboardEmpty.classList.remove('visible');
    scores.forEach((s, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${esc(s.name)}</td>
      <td>${s.time}초</td>
      <td>${s.date || ''}</td>`;
        scoreboardBody.appendChild(tr);
    });
}

function esc(str) {
    return String(str).replace(/[&<>"']/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ── 통합 점수 저장 ────────────────────────────────────────────
async function addScore(name, time) {
    if (isFirebaseReady) {
        await addScoreFirestore(name, time);
        // 스코어보드는 onSnapshot이 자동 업데이트
    } else {
        addScoreLocal(name, time);
    }
}

// ── 이벤트 리스너 ─────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
    stopTimer();
    openNicknameModal();
});

saveScoreBtn.addEventListener('click', async () => {
    saveScoreBtn.disabled = true;
    saveScoreBtn.textContent = '저장 중...';
    await addScore(currentNick, finalTime);
    saveScoreBtn.disabled = false;
    saveScoreBtn.textContent = '저장';
    closeModal(winModal);
});

winSkipBtn.addEventListener('click', () => closeModal(winModal));
loseRetryBtn.addEventListener('click', () => { closeModal(loseModal); initGame(); });

boardEl.addEventListener('contextmenu', e => e.preventDefault());

// ── 앱 시작 ───────────────────────────────────────────────────
(function boot() {
    const ready = initFirebase();

    if (ready) {
        // Firestore 실시간 리스너 등록
        subscribeScoreboard();
    } else {
        // 로컬 기록 표시
        renderScoreboardRows(loadScoresLocal());
    }

    openNicknameModal();
})();
